import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Fix Script Content
 * 
 * Accepts the full PowerShell script as POST body and updates agent_releases.
 * No auth required - this is a one-shot maintenance function.
 * 
 * Usage: curl -X POST -H "Content-Type: text/plain" --data-binary @cybershield-agent-windows-v5.ps1 <url>
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { 
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.4';
    const platform = url.searchParams.get('platform') || 'windows';
    
    const scriptContent = await req.text();
    
    if (!scriptContent || scriptContent.length < 500) {
      return new Response(JSON.stringify({
        error: 'Script content too short',
        length: scriptContent?.length || 0,
        hint: 'POST the full script as request body'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reject HTML
    if (scriptContent.trimStart().startsWith('<!DOCTYPE') || scriptContent.trimStart().startsWith('<html')) {
      return new Response(JSON.stringify({
        error: 'Content is HTML, not a script',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize line endings
    const normalized = platform === 'windows'
      ? scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`[fix-script] Updating ${version} ${platform}: ${bytes.length} bytes, sha256: ${hash.substring(0, 16)}...`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase.from('agent_releases')
      .update({ script_content: normalized, sha256: hash })
      .eq('version', version)
      .eq('platform', platform)
      .eq('is_active', true)
      .select('id, version, platform');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!data?.length) {
      return new Response(JSON.stringify({ error: 'No matching release', version, platform }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      version,
      platform,
      script_size: bytes.length,
      sha256: hash,
      updated: data,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
