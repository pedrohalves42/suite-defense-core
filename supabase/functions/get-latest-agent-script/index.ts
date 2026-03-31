/**
 * get-latest-agent-script — Migrated to servePublic middleware.
 * Public endpoint: returns the latest active agent script from agent_releases.
 * 
 * Security: Only returns the script content, no sensitive data.
 * The script itself requires valid credentials embedded to function.
 * 
 * Usage:
 *   GET /functions/v1/get-latest-agent-script?platform=windows
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

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

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;
  const origin = req.headers.get('origin');

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', requestId }),
      { status: 405, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const platform = url.searchParams.get('platform') || 'windows';
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const includePlainParam = (url.searchParams.get('include_plain') || '').toLowerCase();
  const includeScriptContent = includePlainParam === '1' || includePlainParam === 'true' || includePlainParam === 'yes';

  if (!['windows', 'linux', 'macos'].includes(platform)) {
    return new Response(
      JSON.stringify({ error: 'Invalid platform', message: 'Platform must be one of: windows, linux, macos', requestId }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Fetching latest ${platform} agent script`);

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
    logger.error(`[${requestId}] No active release found:`, releaseError);
    return new Response(
      JSON.stringify({ error: 'No active release found', message: `No active ${platform} agent release available`, requestId }),
      { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Detect and decode base64-encoded script_content from DB
  let releaseScriptContent = release.script_content;
  if (releaseScriptContent && !releaseScriptContent.includes('[CmdletBinding()]') && !releaseScriptContent.startsWith('<#')) {
    try {
      const decoded = atob(releaseScriptContent);
      if (decoded.includes('[CmdletBinding()]') || decoded.startsWith('<#')) {
        logger.info(`[${requestId}] Decoded base64 script_content (${releaseScriptContent.length} -> ${decoded.length} chars)`);
        releaseScriptContent = decoded;
      }
    } catch {
      // Not base64, use as-is
    }
  }

  // Apply runtime hotfix for legacy Windows crypto environments
  if (platform === 'windows' && releaseScriptContent) {
    const hotfix = applyWindowsScriptHotfix(releaseScriptContent);
    if (hotfix.changed) {
      releaseScriptContent = hotfix.content;
      logger.warn(`[${requestId}] Applied Windows ECDSA hotfix at serve-time`, {
        releaseVersion: release.version,
        reasons: hotfix.reasons,
      });

      try {
        const { error: persistError } = await supabase
          .from('agent_releases')
          .update({ script_content: releaseScriptContent })
          .eq('id', release.id);
        if (persistError) {
          logger.warn(`[${requestId}] Could not persist hotfixed script_content`, { error: persistError.message, releaseId: release.id });
        }
      } catch (persistErr) {
        logger.warn(`[${requestId}] Exception persisting hotfix: ${(persistErr as Error).message}`);
      }
    }
  }

  if (!releaseScriptContent || releaseScriptContent.length < 5000) {
    logger.error(`[${requestId}] Script content too short: ${releaseScriptContent?.length || 0} bytes`);
    return new Response(
      JSON.stringify({ error: 'Invalid script content', message: 'Script content is missing or corrupted', requestId }),
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Integrity guard
  const declaredVersion = normalizeVersion(release.version);
  const embeddedVersion = extractScriptVersion(releaseScriptContent);
  if (embeddedVersion && normalizeVersion(embeddedVersion) !== declaredVersion) {
    logger.warn(`[${requestId}] Release/script version mismatch (non-blocking)`, {
      releaseVersion: release.version, embeddedVersion, platform,
    });
  }

  // Normalize for Windows (CRLF)
  let normalizedScript = releaseScriptContent;
  if (platform === 'windows') {
    normalizedScript = releaseScriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
  }

  // Calculate SHA256
  const encoder = new TextEncoder();
  const scriptBytes = encoder.encode(normalizedScript);
  const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
  const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Plain text format
  if (format === 'plain' || format === 'ps1' || format === 'text') {
    logger.info(`[${requestId}] Serving ${platform} script v${release.version} as text/plain (${scriptBytes.length} bytes)`);
    return new Response(normalizedScript, {
      status: 200,
      headers: {
        ...buildCorsHeaders(origin),
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

  logger.info(`[${requestId}] Serving ${platform} script v${release.version} (${scriptBytes.length} bytes)`);

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
        ...buildCorsHeaders(origin),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Request-ID': requestId,
      },
    }
  );
});
