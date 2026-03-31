/**
 * ECDSA/Ed25519 Release Signing Edge Function - Orchestrator
 * Auth: Deno.serve raw (requires super_admin, manual JWT validation)
 * 
 * Decomposed: crypto ops extracted to crypto-ops.ts
 * 
 * Endpoints:
 * - POST ?action=generate-keypair
 * - POST ?action=sign
 * - POST ?action=verify
 * - POST ?action=sign-existing
 * - POST ?action=sign-existing-ed25519
 * - POST ?action=sign-and-register
 * - POST ?action=sign-document
 * - GET  ?action=public-key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import {
  generateKeyPair,
  signWithPrivateKey,
  signWithEd25519,
  verifyWithPublicKey,
  getPublicKeyFingerprint,
  calculateSha256,
} from './crypto-ops.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    logger.info('[sign-release] Request received', { requestId, action });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Verify super_admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Requires super_admin role' }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const json = (fallback = {}) => req.json().catch(() => fallback);
    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

    switch (action) {
      case 'generate-keypair': {
        const keyPair = await generateKeyPair();
        const fingerprint = await getPublicKeyFingerprint(keyPair.publicKey);
        logger.info('[sign-release] Keypair generated', { requestId, fingerprint });

        return respond({
          success: true,
          public_key: keyPair.publicKey,
          private_key: keyPair.privateKey,
          fingerprint,
          algorithm: 'ECDSA-P256-SHA256',
          warning: 'Store private_key securely. It will NOT be shown again.',
          created_at: new Date().toISOString(),
          created_by: user.email
        });
      }

      case 'sign': {
        const body = await req.json();
        const { sha256, private_key } = body;
        if (!sha256 || !private_key) {
          return respond({ error: 'Missing required fields: sha256, private_key' }, 400);
        }

        const signature = await signWithPrivateKey(sha256, private_key);
        return respond({
          success: true, signature_base64: signature, sha256,
          algorithm: 'ECDSA-P256-SHA256', signed_at: new Date().toISOString(), signed_by: user.email
        });
      }

      case 'verify': {
        const body = await req.json();
        const { sha256, signature_base64, public_key } = body;
        if (!sha256 || !signature_base64 || !public_key) {
          return respond({ error: 'Missing required fields: sha256, signature_base64, public_key' }, 400);
        }

        const valid = await verifyWithPublicKey(sha256, signature_base64, public_key);
        const fingerprint = await getPublicKeyFingerprint(public_key);
        return respond({ valid, fingerprint, algorithm: 'ECDSA-P256-SHA256', verified_at: new Date().toISOString() });
      }

      case 'sign-existing': {
        const body = await json({});
        const { release_ids } = body;
        const privateKeyFromSecret = Deno.env.get('ECDSA_PRIVATE_KEY');
        const privateKey = privateKeyFromSecret || body.private_key;

        if (!privateKey) {
          return respond({ error: 'Missing ECDSA private key', message: 'Configure ECDSA_PRIVATE_KEY secret or provide private_key in body' }, 400);
        }

        let query = supabase.from('agent_releases').select('id, version, platform, sha256, signature_base64').eq('is_active', true);
        if (release_ids && Array.isArray(release_ids) && release_ids.length > 0) {
          query = query.in('id', release_ids);
        } else {
          query = query.is('signature_base64', null);
        }

        const { data: releases, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        if (!releases || releases.length === 0) {
          return respond({ success: true, message: 'No releases to sign', signed_count: 0 });
        }

        const results = [];
        const now = new Date().toISOString();

        for (const release of releases) {
          try {
            const signature = await signWithPrivateKey(release.sha256, privateKey);
            const { error: updateError } = await supabase.from('agent_releases')
              .update({ signature_base64: signature, signed_at: now, signed_by: user.email })
              .eq('id', release.id);

            results.push({ id: release.id, version: release.version, platform: release.platform, success: !updateError, error: updateError?.message, signature_base64: signature.substring(0, 20) + '...' });
          } catch (signError) {
            results.push({ id: release.id, version: release.version, platform: release.platform, success: false, error: (signError as Error).message });
          }
        }

        return respond({ success: true, signed_count: results.filter(r => r.success).length, total_count: releases.length, algorithm: 'ECDSA-P256-SHA256', signed_at: now, signed_by: user.email, results });
      }

      case 'sign-document': {
        const body = await req.json();
        const { document_name, document_content, document_hash: providedHash, invariants_version, audit_level } = body;

        if (!document_name) return respond({ error: 'Missing required field: document_name' }, 400);
        if (!providedHash && !document_content) return respond({ error: 'Missing required field: document_hash OR document_content' }, 400);

        const privateKey = Deno.env.get('ECDSA_PRIVATE_KEY');
        if (!privateKey) return respond({ error: 'Missing ECDSA private key' }, 400);

        let document_hash: string;
        let hashSource: 'provided' | 'calculated';

        if (providedHash) {
          if (!/^[a-f0-9]{64}$/i.test(providedHash)) return respond({ error: 'Invalid document_hash: must be 64 hex characters (SHA-256)' }, 400);
          document_hash = providedHash.toLowerCase();
          hashSource = 'provided';
        } else {
          document_hash = await calculateSha256(document_content);
          hashSource = 'calculated';
        }

        const signature_base64 = await signWithPrivateKey(document_hash, privateKey);
        const now = new Date().toISOString();

        const { error: insertError } = await supabase.from('signed_documents').insert({
          document_name, document_hash, signature_base64,
          algorithm: 'ECDSA-P256-SHA256', curve: 'prime256v1', hash_algorithm: 'SHA-256',
          signed_at: now, signed_by: user.email || 'CyberShield Root Key',
          invariants_version: invariants_version || null, audit_level: audit_level || 'STANDARD',
          metadata: { hash_source: hashSource, content_length: document_content?.length || null, signed_by_user_id: user.id }
        });

        if (insertError) throw insertError;

        return respond({
          success: true, document: document_name, algorithm: 'ECDSA-P256-SHA256',
          curve: 'prime256v1', hash_algorithm: 'SHA-256', hash_source: hashSource,
          document_hash, signature_base64, signed_at: now, signed_by: user.email,
          invariants_version: invariants_version || null, audit_level: audit_level || 'STANDARD', persisted: true
        });
      }

      case 'sign-and-register': {
        const body = await req.json();
        const { platform, version, script_content, private_key, release_notes, channel = 'stable' } = body;

        if (!platform || !version || !script_content || !private_key) {
          return respond({ error: 'Missing required fields: platform, version, script_content, private_key' }, 400);
        }

        const sha256 = await calculateSha256(script_content);
        const signature = await signWithPrivateKey(sha256, private_key);

        await supabase.from('agent_releases').update({ is_active: false }).eq('platform', platform).eq('channel', channel);
        await supabase.from('agent_versions').update({ is_latest: false }).eq('platform', platform);

        const { error: releaseError } = await supabase.from('agent_releases').upsert({
          platform, version, channel, script_content, sha256,
          signature_base64: signature, signed_at: new Date().toISOString(), signed_by: user.email,
          release_notes: release_notes || `Signed release ${version}`, is_active: true, created_by: user.id
        }, { onConflict: 'platform,version,channel' });

        if (releaseError) throw releaseError;

        const { error: versionError } = await supabase.from('agent_versions').upsert({
          platform, version, is_latest: true, sha256, size_bytes: script_content.length,
          download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
          release_notes: release_notes || `Signed release ${version}`
        }, { onConflict: 'platform,version' });

        if (versionError) throw versionError;

        return respond({
          success: true, platform, version, sha256, signature_base64: signature,
          algorithm: 'ECDSA-P256-SHA256', signed_at: new Date().toISOString(),
          signed_by: user.email, size_bytes: script_content.length
        });
      }

      case 'sign-existing-ed25519': {
        const ed25519PrivateKey = Deno.env.get('ED25519_PRIVATE_KEY');
        if (!ed25519PrivateKey) return respond({ error: 'Missing ED25519_PRIVATE_KEY secret' }, 400);

        // Get all active releases (re-sign with Ed25519)
        const { data: releases, error: fetchError } = await supabase
          .from('agent_releases')
          .select('id, version, platform, sha256, signature_base64')
          .eq('is_active', true);

        if (fetchError) throw fetchError;

        if (!releases || releases.length === 0) {
          return respond({ success: true, message: 'No active releases found', signed_count: 0 });
        }

        const results = [];
        const now = new Date().toISOString();

        for (const release of releases) {
          try {
            const sig = await signWithEd25519(release.sha256, ed25519PrivateKey);
            const { error: updErr } = await supabase.from('agent_releases')
              .update({ signature_base64: sig, signed_at: now, signed_by: user.email })
              .eq('id', release.id);

            results.push({
              id: release.id, version: release.version, platform: release.platform,
              success: !updErr, error: updErr?.message, signature_preview: sig.substring(0, 20) + '...'
            });
          } catch (e) {
            results.push({
              id: release.id, version: release.version, platform: release.platform,
              success: false, error: (e as Error).message
            });
          }
        }

        return respond({
          success: true, algorithm: 'Ed25519',
          signed_count: results.filter(r => r.success).length,
          total_count: releases.length, signed_at: now, signed_by: user.email, results
        });
      }

      default:
        return respond({
          error: 'Invalid action',
          valid_actions: ['generate-keypair', 'sign', 'verify', 'sign-existing', 'sign-existing-ed25519', 'sign-and-register', 'sign-document']
        }, 400);
    }
  } catch (error) {
    const err = error as Error;
    logger.error('[sign-release] Error', { requestId, error: err.message, stack: err.stack });
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: err.message, requestId }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
