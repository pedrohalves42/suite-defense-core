import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Sync Release from Codebase
 * 
 * Reads the agent scripts from the codebase (bundled with the function)
 * and syncs them to the agent_releases table.
 * 
 * This is necessary because cloud edge functions don't bundle .ps1/.sh files,
 * but DO bundle .ts files that import them via URL.
 */

// Import scripts at module level - bundled with the function
let windowsScript = '';
let linuxScript = '';
let macosScript = '';

try {
  windowsScript = await Deno.readTextFile(
    new URL('../_shared/agent-scripts/cybershield-agent-windows-v5.ps1', import.meta.url)
  );
} catch { windowsScript = ''; }

try {
  linuxScript = await Deno.readTextFile(
    new URL('../_shared/agent-scripts/cybershield-agent-linux-v5.sh', import.meta.url)
  );
} catch { linuxScript = ''; }

try {
  macosScript = await Deno.readTextFile(
    new URL('../_shared/agent-scripts/cybershield-agent-macos-v5.sh', import.meta.url)
  );
} catch { macosScript = ''; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.7';
    
    const scripts: Record<string, string> = {
      windows: windowsScript,
      linux: linuxScript,
      macos: macosScript,
    };

    const results: Record<string, any> = {};

    for (const [platform, content] of Object.entries(scripts)) {
      if (!content || content.length < 1000) {
        results[platform] = { skipped: true, reason: 'Script not available in codebase', length: content?.length || 0 };
        continue;
      }

      // Normalize line endings
      const normalized = platform === 'windows'
        ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
        : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      const bytes = new TextEncoder().encode(normalized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      // Single upsert replaces SELECT + conditional INSERT/UPDATE (saves 1 query per platform)
      const { error } = await supabase.from('agent_releases')
        .upsert({
          version, platform, channel: 'stable',
          script_content: normalized, sha256: hash, is_active: true,
          release_notes: `Synced from codebase ${new Date().toISOString()}`,
        }, { onConflict: 'version,platform' });
      
      if (error) throw new Error(`Upsert ${platform} failed: ${error.message}`);
      results[platform] = { action: 'upserted', size: bytes.length, sha256: hash.substring(0, 16) + '...' };
    }

    return new Response(JSON.stringify({ success: true, version, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
