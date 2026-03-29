import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * ECDSA Release Signing Edge Function
 * 
 * Endpoints:
 * - POST /sign-release?action=generate-keypair - Generate new ECDSA keypair
 * - POST /sign-release?action=sign - Sign a release (requires private key)
 * - POST /sign-release?action=verify - Verify a release signature
 * - POST /sign-release?action=sign-existing - Sign existing active releases without signatures
 * - GET  /sign-release?action=public-key - Get the stored public key
 * 
 * Security: Requires super_admin role
 */

// ECDSA P-256 functions (inline for Edge Function)
async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

async function signWithPrivateKey(content: string, privateKeyBase64: string) {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(content)
  );

  return arrayBufferToBase64(signatureBuffer);
}

// Ed25519 signing function for Zero Trust supply chain
async function signWithEd25519(content: string, privateKeyBase64: string): Promise<string> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    encoder.encode(content)
  );

  return arrayBufferToBase64(signatureBuffer);
}

async function verifyWithPublicKey(content: string, signatureBase64: string, publicKeyBase64: string) {
  try {
    const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
    const signatureBuffer = base64ToArrayBuffer(signatureBase64);

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const encoder = new TextEncoder();
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBuffer,
      encoder.encode(content)
    );
  } catch {
    return false;
  }
}

async function getPublicKeyFingerprint(publicKeyBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(publicKeyBase64));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

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

    // Verify super_admin role (supports users with multiple roles)
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

    // Handle actions
    switch (action) {
      case 'generate-keypair': {
        logger.info('[sign-release] Generating new ECDSA keypair', { requestId });
        
        const keyPair = await generateKeyPair();
        const fingerprint = await getPublicKeyFingerprint(keyPair.publicKey);

        // Store public key in tenant_settings or a dedicated table
        // IMPORTANT: Private key is returned ONCE and must be stored securely by admin
        
        logger.info('[sign-release] Keypair generated', { requestId, fingerprint });

        return new Response(
          JSON.stringify({
            success: true,
            public_key: keyPair.publicKey,
            private_key: keyPair.privateKey, // SENSITIVE - store securely!
            fingerprint,
            algorithm: 'ECDSA-P256-SHA256',
            warning: 'Store private_key securely. It will NOT be shown again.',
            created_at: new Date().toISOString(),
            created_by: user.email
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'sign': {
        const body = await req.json();
        const { sha256, private_key } = body;

        if (!sha256 || !private_key) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: sha256, private_key' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.info('[sign-release] Signing release', { requestId, sha256: sha256.substring(0, 16) + '...' });

        const signature = await signWithPrivateKey(sha256, private_key);
        
        // Derive public key fingerprint for logging
        // (We can't easily get public key from private in this context, so we skip)

        logger.info('[sign-release] Release signed successfully', { requestId });

        return new Response(
          JSON.stringify({
            success: true,
            signature_base64: signature,
            sha256,
            algorithm: 'ECDSA-P256-SHA256',
            signed_at: new Date().toISOString(),
            signed_by: user.email
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'verify': {
        const body = await req.json();
        const { sha256, signature_base64, public_key } = body;

        if (!sha256 || !signature_base64 || !public_key) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: sha256, signature_base64, public_key' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.info('[sign-release] Verifying signature', { requestId });

        const valid = await verifyWithPublicKey(sha256, signature_base64, public_key);
        const fingerprint = await getPublicKeyFingerprint(public_key);

        logger.info('[sign-release] Verification complete', { requestId, valid, fingerprint });

        return new Response(
          JSON.stringify({
            valid,
            fingerprint,
            algorithm: 'ECDSA-P256-SHA256',
            verified_at: new Date().toISOString()
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'sign-existing': {
        // Sign existing releases that don't have signatures
        // Uses ECDSA_PRIVATE_KEY from environment (secret) - more secure
        const body = await req.json().catch(() => ({}));
        const { release_ids } = body;

        // Get private key from secret (priority) or body (fallback for migration)
        const privateKeyFromSecret = Deno.env.get('ECDSA_PRIVATE_KEY');
        const privateKey = privateKeyFromSecret || body.private_key;

        if (!privateKey) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing ECDSA private key',
              message: 'Configure ECDSA_PRIVATE_KEY secret or provide private_key in body',
              hint: 'Generate keypair with action=generate-keypair, then add the private_key as a secret'
            }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        const usingSecret = !!privateKeyFromSecret;
        logger.info('[sign-release] Signing existing releases', { 
          requestId, 
          count: release_ids?.length || 'all active',
          source: usingSecret ? 'secret' : 'body'
        });

        

        // Get releases to sign
        let query = supabase
          .from('agent_releases')
          .select('id, version, platform, sha256, signature_base64')
          .eq('is_active', true);

        if (release_ids && Array.isArray(release_ids) && release_ids.length > 0) {
          query = query.in('id', release_ids);
        } else {
          // Only sign releases without signatures
          query = query.is('signature_base64', null);
        }

        const { data: releases, error: fetchError } = await query;

        if (fetchError) {
          throw fetchError;
        }

        if (!releases || releases.length === 0) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'No releases to sign', 
              signed_count: 0 
            }),
            { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        const results = [];
        const now = new Date().toISOString();

        for (const release of releases) {
          try {
            const signature = await signWithPrivateKey(release.sha256, privateKey);
            
            const { error: updateError } = await supabase
              .from('agent_releases')
              .update({
                signature_base64: signature,
                signed_at: now,
                signed_by: user.email
              })
              .eq('id', release.id);

            if (updateError) {
              results.push({
                id: release.id,
                version: release.version,
                platform: release.platform,
                success: false,
                error: updateError.message
              });
            } else {
              results.push({
                id: release.id,
                version: release.version,
                platform: release.platform,
                success: true,
                signature_base64: signature.substring(0, 20) + '...'
              });
            }
          } catch (signError) {
            const sErr = signError as Error;
            results.push({
              id: release.id,
              version: release.version,
              platform: release.platform,
              success: false,
              error: sErr.message
            });
          }
        }

        const signedCount = results.filter(r => r.success).length;
        logger.info('[sign-release] Finished signing existing releases', { 
          requestId, 
          total: releases.length, 
          signed: signedCount 
        });

        return new Response(
          JSON.stringify({
            success: true,
            signed_count: signedCount,
            total_count: releases.length,
            algorithm: 'ECDSA-P256-SHA256',
            signed_at: now,
            signed_by: user.email,
            results
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'sign-document': {
        // Sign an arbitrary document (Whitepaper, policy, etc.)
        // AUDIT COMPLIANT: Accepts pre-calculated hash OR content (hash calculated internally)
        const body = await req.json();
        const { document_name, document_content, document_hash: providedHash, invariants_version, audit_level } = body;

        if (!document_name) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: document_name' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // OPTION 1: Pre-calculated hash (recommended for supply chain auditing)
        // OPTION 2: Content provided (system calculates hash)
        if (!providedHash && !document_content) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: document_hash OR document_content' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Get private key from secret
        const privateKey = Deno.env.get('ECDSA_PRIVATE_KEY');
        if (!privateKey) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing ECDSA private key',
              message: 'Configure ECDSA_PRIVATE_KEY secret'
            }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        let document_hash: string;
        let hashSource: 'provided' | 'calculated';

        if (providedHash) {
          // Validate hash format (64 hex characters = SHA-256)
          if (!/^[a-f0-9]{64}$/i.test(providedHash)) {
            return new Response(
              JSON.stringify({ error: 'Invalid document_hash: must be 64 hex characters (SHA-256)' }),
              { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }
          document_hash = providedHash.toLowerCase();
          hashSource = 'provided';
        } else {
          // Calculate SHA-256 of document content
          const encoder = new TextEncoder();
          const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(document_content));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          document_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          hashSource = 'calculated';
        }

        logger.info('[sign-release] Signing document', { requestId, document_name, hashSource });

        // Sign the HASH (never the content directly) - AUDIT BEST PRACTICE
        const signature_base64 = await signWithPrivateKey(document_hash, privateKey);
        const now = new Date().toISOString();

        // Persist to signed_documents table
        const { error: insertError } = await supabase
          .from('signed_documents')
          .insert({
            document_name,
            document_hash,
            signature_base64,
            algorithm: 'ECDSA-P256-SHA256',
            curve: 'prime256v1',
            hash_algorithm: 'SHA-256',
            signed_at: now,
            signed_by: user.email || 'CyberShield Root Key',
            invariants_version: invariants_version || null,
            audit_level: audit_level || 'STANDARD',
            metadata: {
              hash_source: hashSource,
              content_length: document_content?.length || null,
              signed_by_user_id: user.id
            }
          });

        if (insertError) {
          logger.error('[sign-release] Failed to persist signature', { requestId, error: insertError.message });
          throw insertError;
        }

        logger.info('[sign-release] Document signed and persisted', { 
          requestId, 
          document_name,
          document_hash: document_hash.substring(0, 16) + '...',
          hashSource
        });

        return new Response(
          JSON.stringify({
            success: true,
            document: document_name,
            algorithm: 'ECDSA-P256-SHA256',
            curve: 'prime256v1',
            hash_algorithm: 'SHA-256',
            hash_source: hashSource,
            document_hash,
            signature_base64,
            signed_at: now,
            signed_by: user.email || 'CyberShield Root Key',
            invariants_version: invariants_version || null,
            audit_level: audit_level || 'STANDARD',
            persisted: true
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'sign-and-register': {
        // Combined action: sign a release and register it atomically
        const body = await req.json();
        const { 
          platform, 
          version, 
          script_content, 
          private_key,
          release_notes,
          channel = 'stable'
        } = body;

        if (!platform || !version || !script_content || !private_key) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: platform, version, script_content, private_key' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Calculate SHA256
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(script_content));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Sign the SHA256
        const signature = await signWithPrivateKey(sha256, private_key);

        logger.info('[sign-release] Signing and registering release', { 
          requestId, 
          platform, 
          version,
          sha256: sha256.substring(0, 16) + '...'
        });

        // Deactivate previous releases
        await supabase
          .from('agent_releases')
          .update({ is_active: false })
          .eq('platform', platform)
          .eq('channel', channel);

        await supabase
          .from('agent_versions')
          .update({ is_latest: false })
          .eq('platform', platform);

        // Insert signed release
        const { error: releaseError } = await supabase
          .from('agent_releases')
          .upsert({
            platform,
            version,
            channel,
            script_content,
            sha256,
            signature_base64: signature,
            signed_at: new Date().toISOString(),
            signed_by: user.email,
            release_notes: release_notes || `Signed release ${version}`,
            is_active: true,
            created_by: user.id
          }, {
            onConflict: 'platform,version,channel'
          });

        if (releaseError) {
          throw releaseError;
        }

        // Insert version record
        const { error: versionError } = await supabase
          .from('agent_versions')
          .upsert({
            platform,
            version,
            is_latest: true,
            sha256,
            size_bytes: script_content.length,
            download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
            release_notes: release_notes || `Signed release ${version}`
          }, {
            onConflict: 'platform,version'
          });

        if (versionError) {
          throw versionError;
        }

        logger.info('[sign-release] Signed release registered', { requestId, platform, version });

        return new Response(
          JSON.stringify({
            success: true,
            platform,
            version,
            sha256,
            signature_base64: signature,
            algorithm: 'ECDSA-P256-SHA256',
            signed_at: new Date().toISOString(),
            signed_by: user.email,
            size_bytes: script_content.length
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'sign-existing-ed25519': {
        // Sign existing releases with Ed25519 using ED25519_PRIVATE_KEY from secrets
        const ed25519PrivateKey = Deno.env.get('ED25519_PRIVATE_KEY');
        if (!ed25519PrivateKey) {
          return new Response(
            JSON.stringify({ error: 'Missing ED25519_PRIVATE_KEY secret' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.info('[sign-release] Signing existing releases with Ed25519', { requestId });

        // Get active releases without signatures
        const { data: ed25519Releases, error: ed25519FetchError } = await supabase
          .from('agent_releases')
          .select('id, version, platform, sha256, signature_base64')
          .eq('is_active', true)
          .is('signature_base64', null);

        if (ed25519FetchError) throw ed25519FetchError;

        if (!ed25519Releases || ed25519Releases.length === 0) {
          // Also check ALL active releases to re-sign with Ed25519
          const { data: allActive } = await supabase
            .from('agent_releases')
            .select('id, version, platform, sha256, signature_base64')
            .eq('is_active', true);

          // Re-sign all active releases with Ed25519 (overwrite ECDSA signatures)
          const releasesToSign = allActive || [];
          if (releasesToSign.length === 0) {
            return new Response(
              JSON.stringify({ success: true, message: 'No active releases found', signed_count: 0 }),
              { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }

          const ed25519Results = [];
          const now = new Date().toISOString();

          for (const release of releasesToSign) {
            try {
              const sig = await signWithEd25519(release.sha256, ed25519PrivateKey);
              const { error: updErr } = await supabase
                .from('agent_releases')
                .update({ signature_base64: sig, signed_at: now, signed_by: user.email })
                .eq('id', release.id);

              ed25519Results.push({
                id: release.id, version: release.version, platform: release.platform,
                success: !updErr, error: updErr?.message,
                signature_preview: sig.substring(0, 20) + '...'
              });
            } catch (e) {
              ed25519Results.push({
                id: release.id, version: release.version, platform: release.platform,
                success: false, error: (e as Error).message
              });
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              algorithm: 'Ed25519',
              signed_count: ed25519Results.filter(r => r.success).length,
              total_count: releasesToSign.length,
              signed_at: now,
              signed_by: user.email,
              results: ed25519Results
            }),
            { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Sign unsigned releases
        const ed25519Results = [];
        const now = new Date().toISOString();

        for (const release of ed25519Releases) {
          try {
            const sig = await signWithEd25519(release.sha256, ed25519PrivateKey);
            const { error: updErr } = await supabase
              .from('agent_releases')
              .update({ signature_base64: sig, signed_at: now, signed_by: user.email })
              .eq('id', release.id);

            ed25519Results.push({
              id: release.id, version: release.version, platform: release.platform,
              success: !updErr, error: updErr?.message,
              signature_preview: sig.substring(0, 20) + '...'
            });
          } catch (e) {
            ed25519Results.push({
              id: release.id, version: release.version, platform: release.platform,
              success: false, error: (e as Error).message
            });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            algorithm: 'Ed25519',
            signed_count: ed25519Results.filter(r => r.success).length,
            total_count: ed25519Releases.length,
            signed_at: now,
            signed_by: user.email,
            results: ed25519Results
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ 
            error: 'Invalid action',
            valid_actions: ['generate-keypair', 'sign', 'verify', 'sign-existing', 'sign-existing-ed25519', 'sign-and-register', 'sign-document']
          }),
          { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
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
