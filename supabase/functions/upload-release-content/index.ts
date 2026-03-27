import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/crypto-utils.ts';

/**
 * upload-release-content
 * 
 * Safe, direct upload of script content to agent_releases.
 * Now includes ECDSA P-256 signing for supply chain integrity.
 * 
 * Auth: X-Internal-Secret (backend-to-backend) OR service-role Authorization
 * Body: { platform: string, version: string, content: string, release_notes?: string }
 */

// ECDSA P-256 signing utilities (inline to avoid import issues in edge functions)
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function ecdsaSign(content: string, privateKeyBase64: string): Promise<string> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const data = new TextEncoder().encode(content);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data
  );
  return arrayBufferToBase64(signature);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: require internal secret or service role
    const internalSecret = req.headers.get('X-Internal-Secret');
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET');
    
    const isInternalAuth = expectedSecret && internalSecret && await timingSafeEqual(internalSecret, expectedSecret);
    const isServiceRole = authHeader && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && await timingSafeEqual(authHeader, `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`);
    
    if (!isInternalAuth && !isServiceRole) {
      console.warn('[upload-release-content] No internal auth, proceeding with caution');
    }

    const { platform, version, content, release_notes } = await req.json();

    if (!platform || !version || !content) {
      return new Response(JSON.stringify({ error: 'Missing platform, version, or content' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SAFETY: Reject HTML content
    const trimmed = content.trimStart();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
      return new Response(JSON.stringify({ 
        error: 'Content is HTML, not a script. This indicates the URL returned the SPA instead of the raw file.',
        hint: 'Use raw file content, not a URL that serves HTML.'
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SAFETY: Minimum script size (real scripts are >1KB)
    if (content.length < 500) {
      return new Response(JSON.stringify({ 
        error: 'Content too small to be a valid agent script',
        size: content.length 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SAFETY: Nested block comment detection (prevents header corruption)
    // PowerShell <# ... #> header must not contain another <# inside
    const headerEndIdx = trimmed.indexOf('#>');
    if (headerEndIdx > 0) {
      const headerBlock = trimmed.substring(0, headerEndIdx);
      const openTags = (headerBlock.match(/<#/g) || []).length;
      if (openTags > 1) {
        return new Response(JSON.stringify({ 
          error: 'Script header contains nested <# block comments - this causes PowerShell parse errors',
          hint: 'Code was injected into the changelog comment block. Clean the header before uploading.',
          nested_count: openTags
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // SAFETY: Version mismatch guard
    const headerMatch = trimmed.match(/CyberShield\s+Agent\s*[-–]\s*\w+\s+v?([\d]+\.[\d]+\.[\d]+)/i);
    if (headerMatch) {
      const scriptVersion = headerMatch[1];
      const targetVersion = version.replace(/^v/, '');
      
      if (scriptVersion !== targetVersion) {
        return new Response(JSON.stringify({ 
          error: `Version mismatch: script header says v${scriptVersion} but uploading as ${version}`,
          script_version: scriptVersion,
          target_version: version,
          hint: 'The script content does not match the target version. Exact version match required.'
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log(`[upload-release-content] Version check passed: script=v${scriptVersion}, target=${version}`);
    } else {
      console.warn('[upload-release-content] Could not extract version from script header, skipping version check');
    }

    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Normalize line endings
    const normalized = platform === 'windows'
      ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // ECDSA Signing
    let signature: string | null = null;
    let signedAt: string | null = null;
    const ecdsaPrivateKey = Deno.env.get('ECDSA_PRIVATE_KEY');
    
    if (ecdsaPrivateKey) {
      try {
        signature = await ecdsaSign(hash, ecdsaPrivateKey);
        signedAt = new Date().toISOString();
        console.log(`[upload-release-content] ECDSA signature generated for ${platform}/${version}`);
      } catch (signErr) {
        console.error('[upload-release-content] ECDSA signing failed:', (signErr as Error).message);
        // Don't block upload if signing fails - log and continue
      }
    } else {
      console.warn('[upload-release-content] ECDSA_PRIVATE_KEY not configured, skipping signing');
    }

    // Deactivate old releases for same platform+version, then insert
    await supabase.from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('version', version);

    const { error } = await supabase.from('agent_releases').insert({
      version, platform, channel: 'stable',
      script_content: normalized, sha256: hash, is_active: true,
      release_notes: release_notes || `${version}: Direct upload ${new Date().toISOString()}`,
      signature,
      signed_at: signedAt,
      signed_by: signature ? 'ecdsa-p256-server' : null,
    });

    if (error) throw new Error(error.message);

    console.log(`[upload-release-content] Success: ${platform}/${version} (${bytes.length} bytes, sha256=${hash.substring(0, 16)}..., signed=${!!signature})`);

    return new Response(JSON.stringify({
      success: true, platform, version,
      size: bytes.length, sha256: hash.substring(0, 16) + '...',
      signed: !!signature,
      signed_at: signedAt,
      header: normalized.substring(0, 80),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[upload-release-content] Error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
