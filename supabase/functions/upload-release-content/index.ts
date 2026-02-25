import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Receives script content in the request body and upserts into agent_releases.
 * Body: { platform: string, version: string, content: string }
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { platform, version, content } = await req.json();

    if (!platform || !version || !content) {
      return new Response(JSON.stringify({ error: 'Missing platform, version, or content' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Reject HTML
    if (content.trimStart().startsWith('<!DOCTYPE') || content.trimStart().startsWith('<html')) {
      return new Response(JSON.stringify({ error: 'Content is HTML, not a script' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Normalize line endings
    const normalized = platform === 'windows'
      ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Delete + insert
    await supabase.from('agent_releases').delete().eq('platform', platform).eq('version', version);

    const { error } = await supabase.from('agent_releases').insert({
      version, platform, channel: 'stable',
      script_content: normalized, sha256: hash, is_active: true,
      release_notes: `${version}: Direct upload ${new Date().toISOString()}`,
    });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({
      success: true, platform, version,
      size: bytes.length, sha256: hash.substring(0, 16) + '...',
      header: normalized.substring(0, 80),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
