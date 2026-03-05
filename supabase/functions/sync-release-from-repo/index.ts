import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Sync Release From Repo - Fetches agent scripts from the published app's
 * public/ directory and registers them in agent_releases table.
 * 
 * This avoids Deno.readTextFile which doesn't work for .sh/.ps1 in Cloud.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The published app URL where public/ files are served
const APP_BASE_URL = Deno.env.get('SITE_URL') || 'https://cybershield.com.br';

const PLATFORM_FILES: Record<string, { file: string; versionRegex: RegExp }> = {
  windows: { file: 'cybershield-agent-windows-v5.ps1', versionRegex: /AgentVersion\s*=\s*"([^"]+)"/ },
  linux: { file: 'cybershield-agent-linux-v5.sh', versionRegex: /AGENT_VERSION="([^"]+)"/ },
  macos: { file: 'cybershield-agent-macos-v5.sh', versionRegex: /AGENT_VERSION="([^"]+)"/ },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const versionOverride = url.searchParams.get('version');
    const platformFilter = url.searchParams.get('platform');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: Record<string, unknown> = {};

    for (const [platform, config] of Object.entries(PLATFORM_FILES)) {
      if (platformFilter && platform !== platformFilter) continue;

      try {
        // Fetch script from the published app
        const scriptUrl = `${APP_BASE_URL}/agent-scripts/${config.file}`;
        console.log(`[SYNC] Fetching ${platform} from ${scriptUrl}`);
        
        const resp = await fetch(scriptUrl);
        if (!resp.ok) {
          results[platform] = { error: `Fetch failed: ${resp.status}`, url: scriptUrl };
          continue;
        }

        const content = await resp.text();
        if (content.length < 1000) {
          results[platform] = { error: `Script too small: ${content.length} bytes` };
          continue;
        }

        // Extract version from script
        const vMatch = content.match(config.versionRegex);
        const version = versionOverride || (vMatch ? vMatch[1] : 'unknown');

        // Normalize line endings
        const normalized = platform === 'windows'
          ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
          : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // SHA256
        const bytes = new TextEncoder().encode(normalized);
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        // Delete existing release for this version+platform, then insert fresh
        await supabase.from('agent_releases')
          .delete()
          .eq('platform', platform).eq('version', version);

        const { error } = await supabase.from('agent_releases')
          .insert({
            version, platform, channel: 'stable',
            script_content: normalized, sha256: hash, is_active: true,
            release_notes: `${version}: Dynamic polling intervals - synced ${new Date().toISOString()}`,
          });

        if (error) throw new Error(`Upsert ${platform}: ${error.message}`);

        // Update agent_versions
        await supabase.from('agent_versions')
          .update({ is_latest: false })
          .eq('platform', platform).eq('is_latest', true);

        await supabase.from('agent_versions')
          .delete()
          .eq('platform', platform).eq('version', version);

        await supabase.from('agent_versions')
          .insert({
            version, platform, sha256: hash, is_latest: true,
            download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
            size_bytes: bytes.length,
            release_notes: `${version}: Dynamic polling intervals from server`,
          });

        results[platform] = { success: true, version, size: bytes.length, sha256: hash.substring(0, 16) + '...' };
      } catch (err) {
        results[platform] = { error: (err as Error).message };
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
