import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Sync Scripts Direct - Reads agent scripts from the bundled _shared directory
 * and upserts them into agent_releases. This bypasses the public URL issue
 * where SPA routing returns HTML instead of script files.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Scripts loaded lazily from storage bucket (file system not available in Deno Deploy)
const SCRIPT_FILES: Record<string, string> = {
  windows: 'cybershield-agent-windows-v5.ps1',
};

async function loadScripts(): Promise<Record<string, string>> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const result: Record<string, string> = {};

  for (const [platform, filename] of Object.entries(SCRIPT_FILES)) {
    // Try file system first (local dev)
    try {
      const content = await Deno.readTextFile(
        new URL(`../_shared/agent-scripts/${filename}`, import.meta.url)
      );
      if (content && content.length > 1000) {
        result[platform] = content;
        console.log(`[sync-scripts-direct] Loaded ${platform} from file: ${content.length} chars`);
        continue;
      }
    } catch { /* expected in Deploy */ }

    // Fallback: storage bucket
    try {
      const { data, error } = await supabase.storage
        .from('agent-installers')
        .download(`scripts/${filename}`);
      if (!error && data) {
        const content = await data.text();
        if (content && content.length > 1000 && !content.trimStart().startsWith('<!DOCTYPE')) {
          result[platform] = content;
          console.log(`[sync-scripts-direct] Loaded ${platform} from storage: ${content.length} chars`);
          continue;
        }
      }
    } catch (e) {
      console.error(`[sync-scripts-direct] Storage read failed for ${platform}: ${(e as Error).message}`);
    }

    result[platform] = '';
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.13';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const scripts = await loadScripts();

    const results: Record<string, unknown> = {};

    for (const [platform, content] of Object.entries(scripts)) {
      if (!content || content.length < 500) {
        results[platform] = { skipped: true, reason: 'Script not loaded', length: content?.length || 0 };
        continue;
      }

      // Reject HTML content
      if (content.trimStart().startsWith('<!DOCTYPE') || content.trimStart().startsWith('<html')) {
        results[platform] = { skipped: true, reason: 'Content is HTML, not a script' };
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

      // Delete existing and insert fresh
      await supabase.from('agent_releases')
        .delete()
        .eq('platform', platform)
        .eq('version', version);

      const { error } = await supabase.from('agent_releases')
        .insert({
          version, platform, channel: 'stable',
          script_content: normalized, sha256: hash, is_active: true,
          release_notes: `${version}: Synced direct from codebase ${new Date().toISOString()}`,
        });

      if (error) throw new Error(`Insert ${platform}: ${error.message}`);

      results[platform] = { 
        success: true, version, size: bytes.length, 
        sha256: hash.substring(0, 16) + '...',
        header: normalized.substring(0, 80),
      };
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
