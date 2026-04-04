/**
 * sign-active-releases — One-shot utility to sign unsigned active releases.
 * Uses the ED25519_PRIVATE_KEY from secrets.
 * Auth: requires INTERNAL_FUNCTION_SECRET header.
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { signPayload } from '../_shared/crypto-utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ED25519_PRIVATE_KEY = Deno.env.get('ED25519_PRIVATE_KEY');
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // One-time utility - temporary, will be deleted after use

  if (!ED25519_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: 'ED25519_PRIVATE_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find unsigned active releases
  const { data: releases, error } = await supabase
    .from('agent_releases')
    .select('id, version, platform, script_content, sha256')
    .eq('is_active', true)
    .is('signature_base64', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ id: string; version: string; platform: string; signed: boolean; error?: string }> = [];

  for (const release of releases || []) {
    try {
      // Compute SHA-256 if missing
      let hash = release.sha256;
      if (!hash && release.script_content) {
        const normalized = release.script_content.replace(/\r\n/g, '\n');
        const bytes = new TextEncoder().encode(normalized);
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        hash = Array.from(new Uint8Array(hashBuffer))
          .map((b: number) => b.toString(16).padStart(2, '0')).join('');
      }

      if (!hash) {
        results.push({ id: release.id, version: release.version, platform: release.platform, signed: false, error: 'no hash' });
        continue;
      }

      const signature = await signPayload(hash, ED25519_PRIVATE_KEY);

      const { error: updateError } = await supabase
        .from('agent_releases')
        .update({
          signature_base64: signature,
          signed_at: new Date().toISOString(),
          signed_by: 'automation-sign-utility',
          sha256: hash,
        })
        .eq('id', release.id);

      if (updateError) {
        results.push({ id: release.id, version: release.version, platform: release.platform, signed: false, error: updateError.message });
      } else {
        results.push({ id: release.id, version: release.version, platform: release.platform, signed: true });
      }
    } catch (e) {
      results.push({ id: release.id, version: release.version, platform: release.platform, signed: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, signed: results.filter(r => r.signed).length, total: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});
