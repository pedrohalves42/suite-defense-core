import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.4';
    const platform = url.searchParams.get('platform') || 'windows';
    
    // Accept script content as raw text body
    const scriptContent = await req.text();
    
    if (!scriptContent || scriptContent.length < 1000) {
      return new Response(JSON.stringify({ error: 'Body too short', length: scriptContent?.length || 0 }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize CRLF
    const normalized = platform === 'windows'
      ? scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : scriptContent;

    const bytes = new TextEncoder().encode(normalized);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`Updating ${version} ${platform}: ${bytes.length} bytes, sha256: ${hash}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('agent_releases')
      .update({ script_content: normalized, sha256: hash })
      .eq('version', version).eq('platform', platform).eq('is_active', true)
      .select('id, version, platform');

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ success: true, version, script_size: bytes.length, sha256: hash, updated: data }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
