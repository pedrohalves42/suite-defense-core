/**
 * Handler: get-latest-agent-script (inlined into public-gateway)
 * Uses the canonical prepareAgentScriptContent pipeline.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { buildCorsHeaders } from '../../_shared/cors.ts';
import { prepareAgentScriptContent } from '../../_shared/agent-script-preparation.ts';
import { resignIfNeeded } from '../../_shared/script-resigner.ts';

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
  supabase: any,
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

  // Fetch signature metadata and re-sign if hotfix changed content
  const { data: releaseSig } = await supabase
    .from('agent_releases')
    .select('signature_base64, signed_at, signed_by')
    .eq('id', release.id)
    .single();

  const resignResult = await resignIfNeeded({
    sha256: prepared.sha256,
    originalSignature: releaseSig?.signature_base64 || null,
    originalSignedAt: releaseSig?.signed_at || null,
    originalSignedBy: releaseSig?.signed_by || null,
    contentChanged: prepared.changed,
    logContext: { version: release.version, platform, scope: 'latest-agent-script', requestId },
  });

  if (prepared.changed && resignResult.resigned && resignResult.signatureBase64 && resignResult.signedAt) {
    const { error: persistSignatureError } = await supabase
      .from('agent_releases')
      .update({
        signature_base64: resignResult.signatureBase64,
        signed_at: resignResult.signedAt,
        signed_by: resignResult.signedBy,
        sha256: prepared.sha256,
      })
      .eq('id', release.id);

    if (persistSignatureError) {
      logger.warn(`[${requestId}] Failed to persist re-signed latest-agent-script metadata`, {
        version: release.version,
        platform,
        error: persistSignatureError.message,
      });
    }
  }

  const responsePayload: Record<string, unknown> = {
    version: release.version, script_content_base64: prepared.base64Content,
    sha256: prepared.sha256, platform, release_notes: release.release_notes, requestId,
    expected_sha256: prepared.sha256,
    signature_base64: resignResult.signatureBase64,
    signature_timestamp: resignResult.signedAt,
  };

  if (includeScriptContent) {
    responsePayload.script_content = prepared.normalizedContent;
  }

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'X-Request-ID': requestId },
  });
}
