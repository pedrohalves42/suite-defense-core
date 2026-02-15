import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Apply Script to DB
 * 
 * Self-contained function that reads the PS1 script from the codebase wrapper
 * and updates agent_releases in the database.
 * No auth required - one-shot maintenance function.
 */

// Try to load script content from codebase
let scriptContent = '';
try {
  const scriptUrl = new URL('../_shared/agent-scripts/cybershield-agent-windows-v5.ps1', import.meta.url);
  scriptContent = await Deno.readTextFile(scriptUrl);
} catch {
  scriptContent = '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.4';
    const platform = url.searchParams.get('platform') || 'windows';
    const dryRun = url.searchParams.get('dry_run') === 'true';

    // If POST body provided, use that instead of codebase file
    let content = scriptContent;
    if (req.method === 'POST') {
      const body = await req.text();
      if (body && body.length > 500) {
        content = body;
      }
    }

    if (!content || content.length < 500) {
      return new Response(JSON.stringify({
        error: 'No script content available',
        hint: 'The .ps1 file is not available in the deployed runtime. POST the script as request body instead.',
        codebase_length: scriptContent.length,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reject HTML
    if (content.trimStart().startsWith('<!DOCTYPE') || content.trimStart().startsWith('<html')) {
      return new Response(JSON.stringify({ error: 'Content is HTML, not a script' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize line endings for Windows
    const normalized = platform === 'windows'
      ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const info = {
      version,
      platform,
      script_size: bytes.length,
      sha256: hash,
      first_100_chars: normalized.substring(0, 100),
      source: content === scriptContent ? 'codebase' : 'post_body',
    };

    if (dryRun) {
      return new Response(JSON.stringify({ dry_run: true, ...info }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      return new Response(JSON.stringify({ error: 'No matching release found', version, platform }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, ...info, updated: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
