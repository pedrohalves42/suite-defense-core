import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Promote Agent Release v5.0.5
 * 
 * Self-contained function that reads v5 scripts from the _shared directory
 * and syncs them to agent_releases table, deactivating v5.0.4.
 * 
 * This is a one-shot utility - call POST with no body.
 * Requires service_role or super_admin auth.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const VERSION = 'v5.0.5';
    const results: Record<string, any> = {};

    const platforms = [
      { platform: 'windows', file: 'cybershield-agent-windows-v5.ps1' },
      { platform: 'linux', file: 'cybershield-agent-linux-v5.sh' },
      { platform: 'macos', file: 'cybershield-agent-macos-v5.sh' },
    ];

    for (const { platform, file } of platforms) {
      try {
        // Try multiple possible paths for Deno Edge Functions
        let scriptContent: string | null = null;
        const possiblePaths = [
          `/home/deno/functions/_shared/agent-scripts/${file}`,
          `../_shared/agent-scripts/${file}`,
          `./_shared/agent-scripts/${file}`,
        ];

        for (const path of possiblePaths) {
          try {
            scriptContent = await Deno.readTextFile(path);
            console.log(`[promote] Found ${file} at ${path}: ${scriptContent.length} chars`);
            break;
          } catch {
            continue;
          }
        }

        if (!scriptContent) {
          results[platform] = { error: 'Script file not found in any path', paths: possiblePaths };
          continue;
        }

        // Validate not HTML
        if (scriptContent.trimStart().startsWith('<!DOCTYPE') || scriptContent.trimStart().startsWith('<html')) {
          results[platform] = { error: 'Content is HTML, not a script' };
          continue;
        }

        // Normalize line endings
        const normalized = platform === 'windows'
          ? scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
          : scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const bytes = new TextEncoder().encode(normalized);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if version already exists
        const { data: existing } = await supabase.from('agent_releases')
          .select('id')
          .eq('version', VERSION)
          .eq('platform', platform)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase.from('agent_releases')
            .update({ script_content: normalized, sha256: hash, is_active: true })
            .eq('id', existing.id);
          
          if (error) throw error;
          results[platform] = { action: 'updated', size: bytes.length, sha256: hash.substring(0, 16) };
        } else {
          const { error } = await supabase.from('agent_releases')
            .insert({
              version: VERSION,
              platform,
              channel: 'stable',
              script_content: normalized,
              sha256: hash,
              is_active: true,
              release_notes: `v5.0.5: Handler parity fix - light_vuln_scan, collect_web_activity, update_agent`,
            });
          
          if (error) throw error;
          results[platform] = { action: 'created', size: bytes.length, sha256: hash.substring(0, 16) };
        }

        // Deactivate previous versions
        const { data: deactivated } = await supabase.from('agent_releases')
          .update({ is_active: false })
          .eq('platform', platform)
          .eq('is_active', true)
          .neq('version', VERSION)
          .select('version');
        
        results[platform].deactivated = deactivated?.map(d => d.version) || [];

      } catch (e) {
        results[platform] = { error: (e as Error).message };
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      version: VERSION,
      results 
    }, null, 2), {
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
