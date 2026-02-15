import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Fetch script from Supabase Storage
    const storageUrl = `${Deno.env.get('SUPABASE_URL')!}/storage/v1/object/public/agent-scripts/cybershield-agent-windows-v5.ps1`;
    console.log('[sync-v5] Fetching script from Storage...');
    
    const scriptResp = await fetch(storageUrl);
    if (!scriptResp.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch script: ${scriptResp.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const scriptContent = await scriptResp.text();
    
    // Validate
    if (scriptContent.length < 1000) {
      return new Response(JSON.stringify({ error: 'Script too short', length: scriptContent.length }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (scriptContent.trimStart().startsWith('<!DOCTYPE') || scriptContent.trimStart().startsWith('<html')) {
      return new Response(JSON.stringify({ error: 'Got HTML instead of script' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!scriptContent.includes('CyberShield Agent')) {
      return new Response(JSON.stringify({ error: 'Not a CyberShield script' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize for Windows
    const normalized = scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`[sync-v5] Script: ${bytes.length} bytes, sha256: ${hash.substring(0, 16)}...`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Try both version formats
    const { data: d1, error: e1 } = await supabase.from('agent_releases')
      .update({ script_content: normalized, sha256: hash })
      .eq('version', 'v5.0.4').eq('platform', 'windows').eq('is_active', true)
      .select('id, version, platform');

    const { data: d2, error: e2 } = await supabase.from('agent_releases')
      .update({ script_content: normalized, sha256: hash })
      .eq('version', '5.0.4').eq('platform', 'windows').eq('is_active', true)
      .select('id, version, platform');

    const updated = [...(d1 || []), ...(d2 || [])];

    return new Response(JSON.stringify({
      success: updated.length > 0,
      script_size: bytes.length,
      sha256: hash,
      updated_records: updated,
      errors: [e1?.message, e2?.message].filter(Boolean),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
