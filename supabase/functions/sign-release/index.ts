/**
 * sign-release — Migrated to serveTenant middleware
 * ECDSA/Ed25519 Release Signing Edge Function
 * Auth: super_admin required
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  generateKeyPair, signWithPrivateKey, signWithEd25519,
  verifyWithPublicKey, getPublicKeyFingerprint, calculateSha256,
} from './crypto-ops.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const SignSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/i), private_key: z.string().min(1).max(10000) });
const VerifySchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/i), signature_base64: z.string().min(1).max(2048), public_key: z.string().min(1).max(10000) });
const SignExistingSchema = z.object({ release_ids: z.array(z.string().uuid()).max(100).optional(), private_key: z.string().min(1).max(10000).optional() });
const SignDocumentSchema = z.object({ document_name: z.string().min(1).max(500), document_content: z.string().max(5_000_000).optional(), document_hash: z.string().regex(/^[a-f0-9]{64}$/i).optional(), invariants_version: z.string().max(32).optional(), audit_level: z.string().max(32).optional() });
const SignAndRegisterSchema = z.object({ platform: z.enum(['windows', 'linux', 'macos']), version: z.string().min(1).max(32), script_content: z.string().min(1).max(5_000_000), private_key: z.string().min(1).max(10000), release_notes: z.string().max(5000).optional(), channel: z.string().max(32).default('stable') });

serveTenant(async (req, ctx) => {
  const { supabase, userId } = ctx;
  const origin = req.headers.get('origin');
  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // Verify super_admin
  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId!);
  if (!roles?.some(r => r.role === 'super_admin')) {
    return new Response(JSON.stringify({ error: 'Requires super_admin role' }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  // Get user email for signing metadata
  const { data: { user } } = await supabase.auth.admin.getUserById(userId!);
  const userEmail = user?.email || 'unknown';

  const json = async (fallback = {}) => {
    try { return await req.clone().json(); } catch { return fallback; }
  };
  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

  switch (action) {
    case 'generate-keypair': {
      const keyPair = await generateKeyPair();
      const fingerprint = await getPublicKeyFingerprint(keyPair.publicKey);
      return respond({ success: true, public_key: keyPair.publicKey, private_key: keyPair.privateKey, fingerprint, algorithm: 'ECDSA-P256-SHA256', warning: 'Store private_key securely.', created_at: new Date().toISOString(), created_by: userEmail });
    }

    case 'sign': {
      const signParsed = SignSchema.safeParse(ctx.body);
      if (!signParsed.success) return respond({ error: 'Invalid payload', issues: signParsed.error.flatten().fieldErrors }, 400);
      const body = signParsed.data;
      const signature = await signWithPrivateKey(body.sha256, body.private_key);
      return respond({ success: true, signature_base64: signature, sha256: body.sha256, algorithm: 'ECDSA-P256-SHA256', signed_at: new Date().toISOString(), signed_by: userEmail });
    }

    case 'verify': {
      const body = ctx.body as Record<string, string>;
      if (!body.sha256 || !body.signature_base64 || !body.public_key) return respond({ error: 'Missing required fields' }, 400);
      const valid = await verifyWithPublicKey(body.sha256, body.signature_base64, body.public_key);
      const fingerprint = await getPublicKeyFingerprint(body.public_key);
      return respond({ valid, fingerprint, algorithm: 'ECDSA-P256-SHA256', verified_at: new Date().toISOString() });
    }

    case 'sign-existing': {
      const body = ctx.body as Record<string, unknown>;
      const { release_ids } = body;
      const privateKey = Deno.env.get('ECDSA_PRIVATE_KEY') || (body.private_key as string);
      if (!privateKey) return respond({ error: 'Missing ECDSA private key' }, 400);

      let query = supabase.from('agent_releases').select('id, version, platform, sha256, signature_base64').eq('is_active', true);
      if (release_ids && Array.isArray(release_ids) && release_ids.length > 0) query = query.in('id', release_ids);
      else query = query.is('signature_base64', null);

      const { data: releases, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      if (!releases || releases.length === 0) return respond({ success: true, message: 'No releases to sign', signed_count: 0 });

      const results = [];
      const now = new Date().toISOString();
      for (const release of releases) {
        try {
          const signature = await signWithPrivateKey(release.sha256, privateKey);
          const { error: updateError } = await supabase.from('agent_releases').update({ signature_base64: signature, signed_at: now, signed_by: userEmail }).eq('id', release.id);
          results.push({ id: release.id, version: release.version, platform: release.platform, success: !updateError, error: updateError?.message, signature_base64: signature.substring(0, 20) + '...' });
        } catch (signError) {
          results.push({ id: release.id, version: release.version, platform: release.platform, success: false, error: (signError as Error).message });
        }
      }
      return respond({ success: true, signed_count: results.filter(r => r.success).length, total_count: releases.length, algorithm: 'ECDSA-P256-SHA256', signed_at: now, signed_by: userEmail, results });
    }

    case 'sign-document': {
      const body = ctx.body as Record<string, unknown>;
      const { document_name, document_content, document_hash: providedHash, invariants_version, audit_level } = body;
      if (!document_name) return respond({ error: 'Missing required field: document_name' }, 400);
      if (!providedHash && !document_content) return respond({ error: 'Missing document_hash OR document_content' }, 400);

      const privateKey = Deno.env.get('ECDSA_PRIVATE_KEY');
      if (!privateKey) return respond({ error: 'Missing ECDSA private key' }, 400);

      let document_hash: string;
      let hashSource: 'provided' | 'calculated';
      if (providedHash) {
        if (!/^[a-f0-9]{64}$/i.test(providedHash as string)) return respond({ error: 'Invalid document_hash' }, 400);
        document_hash = (providedHash as string).toLowerCase();
        hashSource = 'provided';
      } else {
        document_hash = await calculateSha256(document_content as string);
        hashSource = 'calculated';
      }

      const signature_base64 = await signWithPrivateKey(document_hash, privateKey);
      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from('signed_documents').insert({
        document_name, document_hash, signature_base64, algorithm: 'ECDSA-P256-SHA256', curve: 'prime256v1', hash_algorithm: 'SHA-256',
        signed_at: now, signed_by: userEmail || 'CyberShield Root Key',
        invariants_version: invariants_version || null, audit_level: audit_level || 'STANDARD',
        metadata: { hash_source: hashSource, content_length: (document_content as string)?.length || null, signed_by_user_id: userId }
      });
      if (insertError) throw insertError;
      return respond({ success: true, document: document_name, algorithm: 'ECDSA-P256-SHA256', document_hash, signature_base64, signed_at: now, signed_by: userEmail, hash_source: hashSource, persisted: true });
    }

    case 'sign-and-register': {
      const body = ctx.body as Record<string, unknown>;
      const { platform, version, script_content, private_key, release_notes, channel = 'stable' } = body;
      if (!platform || !version || !script_content || !private_key) return respond({ error: 'Missing required fields' }, 400);

      const sha256 = await calculateSha256(script_content as string);
      const signature = await signWithPrivateKey(sha256, private_key as string);
      await supabase.from('agent_releases').update({ is_active: false }).eq('platform', platform).eq('channel', channel);
      await supabase.from('agent_versions').update({ is_latest: false }).eq('platform', platform);

      const { error: releaseError } = await supabase.from('agent_releases').upsert({
        platform, version, channel, script_content, sha256, signature_base64: signature, signed_at: new Date().toISOString(), signed_by: userEmail,
        release_notes: release_notes || `Signed release ${version}`, is_active: true, created_by: userId
      }, { onConflict: 'platform,version,channel' });
      if (releaseError) throw releaseError;

      const { error: versionError } = await supabase.from('agent_versions').upsert({
        platform, version, is_latest: true, sha256, size_bytes: (script_content as string).length,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`, release_notes: release_notes || `Signed release ${version}`
      }, { onConflict: 'platform,version' });
      if (versionError) throw versionError;

      return respond({ success: true, platform, version, sha256, signature_base64: signature, signed_at: new Date().toISOString(), signed_by: userEmail, size_bytes: (script_content as string).length });
    }

    case 'sign-existing-ed25519': {
      const ed25519PrivateKey = Deno.env.get('ED25519_PRIVATE_KEY');
      if (!ed25519PrivateKey) return respond({ error: 'Missing ED25519_PRIVATE_KEY secret' }, 400);

      const { data: releases, error: fetchError } = await supabase.from('agent_releases').select('id, version, platform, sha256, signature_base64').eq('is_active', true);
      if (fetchError) throw fetchError;
      if (!releases || releases.length === 0) return respond({ success: true, message: 'No active releases found', signed_count: 0 });

      const results = [];
      const now = new Date().toISOString();
      for (const release of releases) {
        try {
          const sig = await signWithEd25519(release.sha256, ed25519PrivateKey);
          const { error: updErr } = await supabase.from('agent_releases').update({ signature_base64: sig, signed_at: now, signed_by: userEmail }).eq('id', release.id);
          results.push({ id: release.id, version: release.version, platform: release.platform, success: !updErr, error: updErr?.message });
        } catch (e) {
          results.push({ id: release.id, version: release.version, platform: release.platform, success: false, error: (e as Error).message });
        }
      }
      return respond({ success: true, algorithm: 'Ed25519', signed_count: results.filter(r => r.success).length, total_count: releases.length, signed_at: now, signed_by: userEmail, results });
    }

    case 'public-key': {
      // GET endpoint - just return public key info
      return respond({ info: 'Use generate-keypair to create a new keypair' });
    }

    default:
      return respond({ error: 'Invalid action', valid_actions: ['generate-keypair', 'sign', 'verify', 'sign-existing', 'sign-existing-ed25519', 'sign-and-register', 'sign-document', 'public-key'] }, 400);
  }
}, { skipTenantValidation: true, methods: ['POST', 'GET'] });
