import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * create-release-from-storage
 * Reads a script file from storage and creates an agent_releases entry.
 * Admin-only, one-shot utility.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { platform, version, storage_path, release_notes } = await req.json();
    if (!platform || !version || !storage_path) {
      return new Response(JSON.stringify({ error: 'Missing platform, version, or storage_path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Download from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('agent-installers')
      .download(storage_path);

    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: `Storage download failed: ${dlErr?.message}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let content = await fileData.text();

    // Normalize line endings
    content = platform === 'windows'
      ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Compute SHA256
    const bytes = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Deactivate old releases for same platform
    await supabase.from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('is_active', true);

    // Insert new release
    const { error: insertErr } = await supabase.from('agent_releases').insert({
      version, platform, channel: 'stable',
      script_content: content, sha256: hash, is_active: true,
      release_notes: release_notes || `${version}: Multi-platform release ${new Date().toISOString()}`,
    });

    if (insertErr) throw new Error(insertErr.message);

    return new Response(JSON.stringify({
      success: true, platform, version,
      size: bytes.length, sha256: hash.substring(0, 16) + '...',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
