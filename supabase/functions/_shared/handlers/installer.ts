/**
 * Handler: serve-installer (inlined into public-gateway)
 * Generates custom agent installer scripts from enrollment keys.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../../_shared/cors.ts';
import { requireEnv } from '../../_shared/env.ts';
import { logger } from '../../_shared/logger.ts';
import { checkRateLimit } from '../../_shared/rate-limit.ts';
import { withTimeout, createTimeoutResponse } from '../../_shared/timeout.ts';
import { INSTALLER_VERSION, LAST_UPDATED, getVersionInfo } from '../../_shared/installer-version.ts';
import { validateNoPlaceholders, validateInstallerScript } from '../../_shared/installer-validation.ts';
import { resolveAgent } from '../../_shared/installer-agent-resolver.ts';
import { buildInstallerScript } from '../../_shared/installer-script-builder.ts';
import { persistInstallerHash, trackDownloadEvent } from '../../_shared/installer-telemetry.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');

export async function handleServeInstaller(
  supabase: SupabaseClient,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const origin = req.headers.get('origin');
  const startTime = Date.now();

  logger.info('[serve-installer] Gateway handler started', { timestamp: new Date().toISOString(), requestId });

  try {
    return await withTimeout(async () => {
      logger.debug(`[${requestId}] ${getVersionInfo()}`);

      const enrollmentKey = payload.enrollmentKey as string;
      const mode = (payload.mode as string) || 'args';
      const hostname = (payload.hostname as string) || null;
      const osType = (payload.os_type as string) || null;

      if (mode !== 'args' && mode !== 'envvars') {
        return new Response(JSON.stringify({ error: 'Invalid mode parameter. Use mode=args or mode=envvars' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }

      if (!enrollmentKey) {
        return new Response('Enrollment key is required', { status: 400, headers: buildCorsHeaders(origin) });
      }

      // Rate limiting
      const clientIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateLimitResult = await checkRateLimit(supabase, clientIp, 'serve-installer', { maxRequests: 10, windowMinutes: 60, blockMinutes: 30 });
      if (!rateLimitResult.allowed) {
        logger.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIp}`, { resetAt: rateLimitResult.resetAt });
        return new Response(
          JSON.stringify({ error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.', retryAfter: rateLimitResult.resetAt?.toISOString() }),
          { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': rateLimitResult.resetAt ? Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString() : '1800' } },
        );
      }

      // Hash enrollment key
      const keyHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(enrollmentKey));
      const enrollmentKeyHash = Array.from(new Uint8Array(keyHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // Fetch enrollment key
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('enrollment_keys')
        .select('agent_id, is_active, expires_at, tenant_id')
        .eq('key_hash', enrollmentKeyHash)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();

      if (enrollmentError || !enrollmentData) {
        return new Response('Invalid or expired enrollment key', { status: 404, headers: buildCorsHeaders(origin) });
      }
      if (!enrollmentData.is_active) {
        return new Response('This enrollment key has been used', { status: 410, headers: buildCorsHeaders(origin) });
      }
      if (new Date(enrollmentData.expires_at) < new Date()) {
        return new Response('This enrollment key has expired', { status: 410, headers: buildCorsHeaders(origin) });
      }

      // Resolve agent
      const resolveResult = await resolveAgent(supabase, enrollmentData, enrollmentKeyHash, hostname, osType, requestId, origin);
      if (resolveResult instanceof Response) return resolveResult;
      const { agentId, agentData } = resolveResult;

      // Generate fresh token
      const freshAgentToken = crypto.randomUUID();
      const freshTokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(freshAgentToken));
      const freshTokenHash = Array.from(new Uint8Array(freshTokenHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const freshTokenPrefix = freshAgentToken.substring(0, 8);

      await supabase.from('agent_tokens').update({ is_active: false }).eq('agent_id', agentId);

      const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const { error: tokenInsertError } = await supabase.from('agent_tokens').insert({
        agent_id: agentId, token_hash: freshTokenHash, token_prefix: freshTokenPrefix,
        expires_at: tokenExpiresAt.toISOString(), is_active: true,
      });

      if (tokenInsertError) {
        logger.error(`[${requestId}] Failed to create fresh agent token`, tokenInsertError);
        return new Response('Failed to generate agent credentials', { status: 500, headers: buildCorsHeaders(origin) });
      }

      // Validate credentials
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!freshAgentToken || !uuidRegex.test(freshAgentToken)) {
        return new Response('Invalid agent token format', { status: 500, headers: buildCorsHeaders(origin) });
      }
      if (!agentData.hmac_secret || agentData.hmac_secret.length !== 64 || !/^[0-9a-f]{64}$/i.test(agentData.hmac_secret)) {
        return new Response('Invalid HMAC secret format', { status: 500, headers: buildCorsHeaders(origin) });
      }

      // Build installer script
      const platform = agentData.os_type || 'windows';
      const buildResult = await buildInstallerScript(supabase, platform, mode as 'args' | 'envvars', agentData, freshAgentToken, SUPABASE_URL, requestId, origin);
      if (buildResult instanceof Response) return buildResult;
      const { templateContent } = buildResult;

      // Validate installer
      const validationError = validateInstallerScript(templateContent, platform, agentData.agent_name, requestId, origin);
      if (validationError) return validationError;
      validateNoPlaceholders(templateContent, platform, requestId);

      // Persist hash & track
      const { sha256, sizeBytes } = await persistInstallerHash(supabase, templateContent, enrollmentKey, requestId);
      await trackDownloadEvent(supabase, enrollmentData.tenant_id, agentId, agentData.agent_name, platform, sha256, sizeBytes, req, requestId);

      // Return script
      const fileName = platform === 'windows'
        ? `install-${agentData.agent_name}-windows.ps1`
        : `install-${agentData.agent_name}-linux.sh`;

      logger.info(`[${requestId}] Completed successfully in ${Date.now() - startTime}ms`);

      return new Response(templateContent, {
        headers: {
          ...buildCorsHeaders(origin),
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'X-Script-SHA256': sha256,
          'X-Script-Size': sizeBytes.toString(),
          'X-Installer-Version': INSTALLER_VERSION,
          'X-Installer-Updated': LAST_UPDATED,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }, { timeoutMs: 30000 });

  } catch (error) {
    if (error instanceof Error && error.message === 'Request timeout') {
      return createTimeoutResponse(buildCorsHeaders(origin));
    }
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] Failed after ${duration}ms:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', requestId }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }
}
