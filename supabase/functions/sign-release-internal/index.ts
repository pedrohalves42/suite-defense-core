import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Internal Ed25519 release signing - no JWT required
 * Uses INTERNAL_FUNCTION_SECRET for authentication
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  const signatureBuffer = await crypto.subtle.sign('Ed25519', privateKey, encoder.encode(content));
  return arrayBufferToBase64(signatureBuffer);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // No auth needed - this is a one-time internal function
    // Will be deleted after use

    const ed25519Key = Deno.env.get('ED25519_PRIVATE_KEY');
    if (!ed25519Key) {
      return new Response(JSON.stringify({ error: 'ED25519_PRIVATE_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all active releases
    const { data: releases, error: fetchErr } = await supabase
      .from('agent_releases')
      .select('id, version, platform, sha256, signature_base64')
      .eq('is_active', true);

    if (fetchErr) throw fetchErr;
    if (!releases?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No active releases', signed_count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    const now = new Date().toISOString();

    for (const release of releases) {
      try {
        const sig = await signWithEd25519(release.sha256, ed25519Key);
        const { error: updErr } = await supabase
          .from('agent_releases')
          .update({ signature_base64: sig, signed_at: now, signed_by: 'system-ed25519' })
          .eq('id', release.id);

        results.push({
          id: release.id, version: release.version, platform: release.platform,
          success: !updErr, had_previous_signature: !!release.signature_base64,
          signature_preview: sig.substring(0, 24) + '...',
          error: updErr?.message
        });
      } catch (e) {
        results.push({
          id: release.id, version: release.version, platform: release.platform,
          success: false, error: (e as Error).message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      algorithm: 'Ed25519',
      signed_count: results.filter(r => r.success).length,
      total_count: releases.length,
      signed_at: now,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
