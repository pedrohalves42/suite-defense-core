import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Sync Agent Release Content
 * 
 * Two modes:
 * 1. POST with body: receives raw script content and upserts into agent_releases
 * 2. POST with JSON { action: "promote", version, platform }: creates new version from codebase
 * 
 * Query params:
 *   - version: target version (default: v5.0.5)
 *   - platform: target platform (default: windows)
 *   - deactivate_previous: if "true", deactivates older versions for same platform (default: true)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Auth: Accept internal secret OR super_admin
    const internalSecret = req.headers.get('X-Internal-Secret');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET') || Deno.env.get('INTERNAL_FUNCTION_SECRET');
    
    if (!(internalSecret && expectedSecret && internalSecret === expectedSecret)) {
      const authResult = await requireSuperAdmin(req);
      if (!authResult.success) {
        return authResult.response!;
      }
    }

    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.5';
    const platform = url.searchParams.get('platform') || 'windows';
    const deactivatePrevious = url.searchParams.get('deactivate_previous') !== 'false';
    
    const contentType = req.headers.get('content-type') || '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let scriptContent: string;

    // Check if it's a JSON action request
    if (contentType.includes('application/json')) {
      const body = await req.json();
      
      if (body.action === 'read_codebase') {
        // Try to read from _shared/agent-scripts
        const platformFileMap: Record<string, string> = {
          windows: 'cybershield-agent-windows-v5.ps1',
          linux: 'cybershield-agent-linux-v5.sh',
          macos: 'cybershield-agent-macos-v5.sh',
        };
        
        const filename = platformFileMap[platform];
        if (!filename) {
          return new Response(JSON.stringify({ error: `Unknown platform: ${platform}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        try {
          scriptContent = await Deno.readTextFile(`/home/deno/functions/_shared/agent-scripts/${filename}`);
          console.log(`[sync-release] Read ${filename} from codebase: ${scriptContent.length} chars`);
        } catch (readErr) {
          return new Response(JSON.stringify({ 
            error: `Cannot read codebase file: ${filename}. In production, send script content directly via POST body.`,
            hint: 'Edge functions in Lovable Cloud cannot access non-TS files at runtime. Use direct POST with script content instead.'
          }), {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Invalid JSON action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else {
      // Raw body = script content
      scriptContent = await req.text();
    }
    
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

    console.log(`[sync-release] Processing ${version} ${platform}: ${bytes.length} bytes, sha256: ${hash.substring(0, 16)}...`);

    // Check if version already exists
    const { data: existing } = await supabase.from('agent_releases')
      .select('id, version, is_active')
      .eq('version', version)
      .eq('platform', platform)
      .maybeSingle();

    let result;

    if (existing) {
      // Update existing
      console.log(`[sync-release] Updating existing release ${existing.id}`);
      const { data, error } = await supabase.from('agent_releases')
        .update({ script_content: normalized, sha256: hash, is_active: true })
        .eq('id', existing.id)
        .select('id, version, platform');
      
      if (error) throw new Error(`Update failed: ${error.message}`);
      result = { action: 'updated', records: data };
    } else {
      // Insert new
      console.log(`[sync-release] Creating new release ${version} for ${platform}`);
      const { data, error } = await supabase.from('agent_releases')
        .insert({
          version,
          platform,
          channel: 'stable',
          script_content: normalized,
          sha256: hash,
          is_active: true,
          release_notes: `Auto-synced from codebase on ${new Date().toISOString()}`,
        })
        .select('id, version, platform');
      
      if (error) throw new Error(`Insert failed: ${error.message}`);
      result = { action: 'created', records: data };
    }

    // Deactivate previous versions for this platform
    if (deactivatePrevious) {
      const { data: deactivated, error: deactErr } = await supabase.from('agent_releases')
        .update({ is_active: false })
        .eq('platform', platform)
        .eq('is_active', true)
        .neq('version', version)
        .select('id, version');
      
      if (deactErr) {
        console.error(`[sync-release] Warning: failed to deactivate previous: ${deactErr.message}`);
      } else {
        console.log(`[sync-release] Deactivated ${deactivated?.length || 0} previous versions`);
        result.deactivated = deactivated;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      version, 
      platform,
      script_size: bytes.length, 
      sha256: hash,
      ...result
    }), {
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error(`[sync-release] Error: ${(e as Error).message}`);
    return new Response(JSON.stringify({ error: (e as Error).message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
