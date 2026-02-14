import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Sync Agent Release Content
 * 
 * Accepts raw script content via POST body and updates the agent_releases table.
 * Requires super_admin authentication OR X-Internal-Secret for automated syncs.
 * 
 * Query params:
 *   - version: target version (default: v5.0.4)
 *   - platform: target platform (default: windows)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Auth: Accept internal secret OR super_admin
    const internalSecret = req.headers.get('X-Internal-Secret');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET');
    
    if (!(internalSecret && expectedSecret && internalSecret === expectedSecret)) {
      const authResult = await requireSuperAdmin(req);
      if (!authResult.success) {
        return authResult.response!;
      }
    }

    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.4';
    const platform = url.searchParams.get('platform') || 'windows';
    
    const scriptContent = await req.text();
    
    if (!scriptContent || scriptContent.length < 1000) {
      return new Response(JSON.stringify({ 
        error: 'Body too short - expected script content',
        length: scriptContent?.length || 0 
      }), {
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate it's actually a script, not HTML
    if (scriptContent.trimStart().startsWith('<!DOCTYPE') || scriptContent.trimStart().startsWith('<html')) {
      return new Response(JSON.stringify({ 
        error: 'Content appears to be HTML, not a script',
        preview: scriptContent.substring(0, 100)
      }), {
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize line endings per platform
    const normalized = platform === 'windows'
      ? scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`[sync-release] Updating ${version} ${platform}: ${bytes.length} bytes, sha256: ${hash.substring(0, 16)}...`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('agent_releases')
      .update({ script_content: normalized, sha256: hash })
      .eq('version', version)
      .eq('platform', platform)
      .eq('is_active', true)
      .select('id, version, platform');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (!data?.length) {
      return new Response(JSON.stringify({ 
        error: 'No matching release found',
        version, platform 
      }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      version, 
      platform,
      script_size: bytes.length, 
      sha256: hash, 
      updated: data 
    }), {
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
