import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts';

/**
 * Get Latest Agent Script (Public Endpoint)
 * 
 * Returns the latest active agent script from agent_releases.
 * This is a PUBLIC endpoint (no auth required) used for:
 * - Reinstallation scripts that need to download the latest version
 * - Recovery scenarios when HMAC authentication fails
 * 
 * Security: Only returns the script content, no sensitive data.
 * The script itself requires valid credentials embedded to function.
 * 
 * Usage:
 *   GET /functions/v1/get-latest-agent-script?platform=windows
 *   
 * Response:
 *   { 
 *     version: "v5.0.2",
 *     script_content: "...",
 *     script_content_base64: "...",
 *     sha256: "...",
 *     platform: "windows"
 *   }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function normalizeVersion(v: string | null | undefined): string {
  return v?.replace(/^v/i, '').trim() || '';
}

function extractScriptVersion(content: string): string | null {
  const headerMatch = content.match(/CyberShield\s+Agent\s*-\s*Windows\s+v?([\d]+\.[\d]+\.[\d]+)/i);
  if (headerMatch?.[1]) return headerMatch[1];

  const paramMatch = content.match(/\$AgentVersion\s*=\s*"v?([\d]+\.[\d]+\.[\d]+)"/i);
  if (paramMatch?.[1]) return paramMatch[1];

  return null;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', requestId }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') || 'windows';
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const includePlainParam = (url.searchParams.get('include_plain') || '').toLowerCase();
    const includeScriptContent = includePlainParam === '1' || includePlainParam === 'true' || includePlainParam === 'yes';
    
    // Validate platform
    if (!['windows', 'linux', 'macos'].includes(platform)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid platform',
          message: 'Platform must be one of: windows, linux, macos',
          requestId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Fetching latest ${platform} agent script`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch latest active release
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('id, version, script_content, sha256, release_notes, created_at')
      .eq('platform', platform)
      .eq('is_active', true)
      .eq('channel', 'stable')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (releaseError || !release) {
      console.error(`[${requestId}] No active release found:`, releaseError);
      return new Response(
        JSON.stringify({
          error: 'No active release found',
          message: `No active ${platform} agent release available`,
          requestId
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply runtime hotfix for legacy Windows crypto environments (non-breaking, self-healing)
    let releaseScriptContent = release.script_content;
    if (platform === 'windows' && releaseScriptContent) {
      const hotfix = applyWindowsScriptHotfix(releaseScriptContent);
      if (hotfix.changed) {
        releaseScriptContent = hotfix.content;
        console.warn(`[${requestId}] Applied Windows ECDSA hotfix at serve-time`, {
          releaseVersion: release.version,
          reasons: hotfix.reasons,
        });

        // Best-effort persistence so all endpoints (including serve-agent-update) benefit immediately
        try {
          const { error: persistError } = await supabase
            .from('agent_releases')
            .update({ script_content: releaseScriptContent })
            .eq('id', release.id);

          if (persistError) {
            console.warn(`[${requestId}] Could not persist hotfixed script_content`, {
              error: persistError.message,
              releaseId: release.id,
            });
          }
        } catch (persistErr) {
          const err = persistErr as Error;
          console.warn(`[${requestId}] Exception persisting hotfix: ${err.message}`);
        }
      }
    }

    // Validate script content
    if (!releaseScriptContent || releaseScriptContent.length < 5000) {
      console.error(`[${requestId}] Script content too short: ${releaseScriptContent?.length || 0} bytes`);
      return new Response(
        JSON.stringify({
          error: 'Invalid script content',
          message: 'Script content is missing or corrupted',
          requestId
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Integrity guard: log mismatch but don't block (allow serving latest DB content)
    const declaredVersion = normalizeVersion(release.version);
    const embeddedVersion = extractScriptVersion(releaseScriptContent);
    if (embeddedVersion && normalizeVersion(embeddedVersion) !== declaredVersion) {
      console.warn(`[${requestId}] Release/script version mismatch (non-blocking)`, {
        releaseVersion: release.version,
        embeddedVersion,
        platform,
      });
      // Continue serving - the script_content from DB is authoritative
    }

    // Normalize for Windows (CRLF)
    let normalizedScript = releaseScriptContent;
    if (platform === 'windows') {
      normalizedScript = releaseScriptContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n/g, '\r\n');
    }

    // Calculate SHA256
    const encoder = new TextEncoder();
    const scriptBytes = encoder.encode(normalizedScript);
    const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Option: serve as plain text (avoids huge JSON parsing issues in older PowerShell)
    if (format === 'plain' || format === 'ps1' || format === 'text') {
      console.log(`[${requestId}] Serving ${platform} script v${release.version} as text/plain (${scriptBytes.length} bytes)`);

      return new Response(normalizedScript, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Agent-Version': release.version,
          'X-Agent-Sha256': sha256,
          'X-Request-ID': requestId,
        },
      });
    }

    // Base64 encode (JSON mode)
    const base64Chunks: string[] = [];
    const chunkSize = 0x8000;
    for (let i = 0; i < scriptBytes.length; i += chunkSize) {
      const chunk = scriptBytes.subarray(i, i + chunkSize);
      base64Chunks.push(String.fromCharCode(...chunk));
    }
    const base64Script = btoa(base64Chunks.join(''));

    console.log(`[${requestId}] Serving ${platform} script v${release.version} (${scriptBytes.length} bytes)`);

    const responsePayload: Record<string, unknown> = {
      version: release.version,
      script_content_base64: base64Script,
      sha256,
      platform,
      release_notes: release.release_notes,
      requestId,
    };

    if (includeScriptContent) {
      responsePayload.script_content = normalizedScript;
    }

    return new Response(
      JSON.stringify(responsePayload),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Request-ID': requestId
        }
      }
    );

  } catch (error) {
    const err = error as Error;
    console.error(`[${requestId}] Error:`, err.message);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
