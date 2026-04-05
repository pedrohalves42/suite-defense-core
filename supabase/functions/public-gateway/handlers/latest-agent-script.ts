/**
 * Handler: get-latest-agent-script (inlined into public-gateway)
 * Uses the canonical prepareAgentScriptContent pipeline.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { buildCorsHeaders } from '../../_shared/cors.ts';
import { prepareAgentScriptContent } from '../../_shared/agent-script-preparation.ts';

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

export async function handleGetLatestAgentScript(
  supabase: SupabaseClient,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const origin = req.headers.get('origin');

  const platform = (payload.platform as string) || 'windows';
  const format = ((payload.format as string) || 'json').toLowerCase();
  const includePlainParam = ((payload.include_plain as string) || '').toLowerCase();
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

  // Unified pipeline: decode → hotfix → reject HTML → normalize → SHA-256 → base64
  const prepared = await prepareAgentScriptContent({
    supabase,
    releaseId: release.id,
    rawScriptContent: release.script_content,
    platform,
    requestId,
    logScope: 'latest-agent-script',
    persistIfChanged: true,
  });

  if (!prepared || prepared.content.length < 5000) {
    logger.error(`[${requestId}] Script content too short: ${prepared?.content.length || 0} bytes`);
    return new Response(
      JSON.stringify({ error: 'Invalid script content', message: 'Script content is missing or corrupted', requestId }),
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const declaredVersion = normalizeVersion(release.version);
  const embeddedVersion = extractScriptVersion(prepared.content);
  if (embeddedVersion && normalizeVersion(embeddedVersion) !== declaredVersion) {
    logger.warn(`[${requestId}] Release/script version mismatch (non-blocking)`, { releaseVersion: release.version, embeddedVersion, platform });
  }

  if (format === 'plain' || format === 'ps1' || format === 'text') {
    logger.info(`[${requestId}] Serving ${platform} script v${release.version} as text/plain (${prepared.normalizedContent.length} bytes)`);
    return new Response(prepared.normalizedContent, {
      status: 200,
      headers: {
        ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Agent-Version': release.version, 'X-Agent-Sha256': prepared.sha256, 'X-Request-ID': requestId,
      },
    });
  }

  logger.info(`[${requestId}] Serving ${platform} script v${release.version} (${prepared.normalizedContent.length} bytes)`);

  const responsePayload: Record<string, unknown> = {
    version: release.version, script_content_base64: prepared.base64Content,
    sha256: prepared.sha256, platform, release_notes: release.release_notes, requestId,
  };

  if (includeScriptContent) {
    responsePayload.script_content = prepared.normalizedContent;
  }

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'X-Request-ID': requestId },
  });
}
