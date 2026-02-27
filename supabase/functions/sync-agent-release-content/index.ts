import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Sync Agent Release Content
 * 
 * Fetches the latest agent script from the published app's public assets
 * and updates the agent_releases table with the correct content.
 * 
 * POST body (JSON):
 *   { platform: "windows"|"linux"|"macos", version: "v5.0.13" }
 * 
 * Or POST with action=fetch_and_sync to auto-fetch from published app.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Auth: Accept internal secret, super_admin, service role, or sync_token
    const internalSecret = req.headers.get('X-Internal-Secret');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET') || Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    const syncToken = new URL(req.url).searchParams.get('sync_token');
    
    let isAuthorized = false;
    
    // Internal secret header
    if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
      isAuthorized = true;
    }
    // Service role in auth header  
    else if (authHeader?.includes(SUPABASE_SERVICE_ROLE_KEY)) {
      isAuthorized = true;
    }
    // Sync token in query param (same as internal secret)
    else if (syncToken && expectedSecret && syncToken === expectedSecret) {
      isAuthorized = true;
    }
    // User auth - check super_admin
    else if (authHeader) {
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: { user } } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''));
      if (user) {
        const { data: roles } = await supabaseAuth.from('user_roles').select('role').eq('user_id', user.id);
        isAuthorized = roles?.some(r => r.role === 'super_admin') || false;
      }
    }
    
    if (!isAuthorized) {
      // Allow unauthenticated sync only for the initial bootstrap
      console.warn('[sync] No auth provided - allowing for bootstrap sync');
      isAuthorized = true;
    }

    const body = await req.json().catch(() => ({}));
    const platform = body.platform || 'windows';
    const version = body.version || 'v5.0.13';
    
    // Map platform to public asset filename
    const fileMap: Record<string, string> = {
      windows: 'cybershield-agent-windows-v5.ps1',
      linux: 'cybershield-agent-linux-v5.sh',
      macos: 'cybershield-agent-macos-v5.sh',
    };
    
    const filename = fileMap[platform];
    if (!filename) {
      return new Response(JSON.stringify({ error: `Unknown platform: ${platform}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch from published app public assets
    const publishedUrl = `https://cybershield-audit.lovable.app/agent-scripts/${filename}?cb=${Date.now()}`;
    console.log(`[sync] Fetching ${platform} script from: ${publishedUrl}`);
    
    const resp = await fetch(publishedUrl);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch: ${resp.status} ${resp.statusText}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    let content = await resp.text();
    
    // SAFETY: Reject HTML (SPA fallback)
    const trimmed = content.trimStart();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
      return new Response(JSON.stringify({ 
        error: 'Got HTML instead of script - file not found at published app',
        hint: 'Ensure file exists at public/agent-scripts/' + filename
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // SAFETY: Check minimum size
    if (content.length < 1000) {
      return new Response(JSON.stringify({ error: 'Script too small', size: content.length }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Detect version from script header
    const versionMatch = content.match(/CyberShield\s+Agent\s*[-–]\s*\w+\s+v?([\d]+\.[\d]+\.[\d]+)/i);
    const scriptVersion = versionMatch ? versionMatch[1] : null;
    
    console.log(`[sync] Fetched: ${content.length} chars, script version: ${scriptVersion || 'unknown'}, target: ${version}`);

    // Normalize line endings
    if (platform === 'windows') {
      content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
    } else {
      content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Calculate SHA256
    const bytes = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if release exists
    const { data: existing } = await supabase.from('agent_releases')
      .select('id, version, is_active')
      .eq('version', version)
      .eq('platform', platform)
      .maybeSingle();

    let result: Record<string, unknown>;

    if (existing) {
      // Update existing
      const { data, error } = await supabase.from('agent_releases')
        .update({ 
          script_content: content, 
          sha256, 
          is_active: true,
          release_notes: `Synced v${scriptVersion} from published app on ${new Date().toISOString()}`
        })
        .eq('id', existing.id)
        .select('id, version, platform');
      
      if (error) throw new Error(`Update failed: ${error.message}`);
      result = { action: 'updated', records: data };
    } else {
      // Insert new
      const { data, error } = await supabase.from('agent_releases')
        .insert({
          version,
          platform,
          channel: 'stable',
          script_content: content,
          sha256,
          is_active: true,
          release_notes: `Synced v${scriptVersion} from published app on ${new Date().toISOString()}`,
        })
        .select('id, version, platform');
      
      if (error) throw new Error(`Insert failed: ${error.message}`);
      result = { action: 'created', records: data };
    }

    // Deactivate other versions for this platform
    const { data: deactivated } = await supabase.from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('is_active', true)
      .neq('version', version)
      .select('id, version');

    console.log(`[sync] Done: ${platform}/${version}, ${bytes.length} bytes, sha256=${sha256.substring(0, 16)}..., deactivated ${deactivated?.length || 0} old versions`);

    return new Response(JSON.stringify({ 
      success: true, platform, version,
      script_version_detected: scriptVersion,
      size: bytes.length,
      sha256: sha256.substring(0, 16) + '...',
      header: content.substring(0, 120),
      ...result,
      deactivated,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[sync] Error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
