/**
 * serve-installer - Generates custom agent installer scripts
 * 
 * MIGRATED to servePublic middleware
 * Auth: Enrollment key (public with rate limit)
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { INSTALLER_VERSION, LAST_UPDATED, getVersionInfo } from '../_shared/installer-version.ts';
import { validateNoPlaceholders, validateInstallerScript } from './validation.ts';
import { resolveAgent } from './agent-resolver.ts';
import { buildInstallerScript } from './script-builder.ts';
import { persistInstallerHash, trackDownloadEvent } from './telemetry.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');

servePublic(async (req, ctx) => {
  const { supabase: supabaseClient, requestId } = ctx;
  const origin = req.headers.get('origin');
  const startTime = Date.now();

  logger.info('[serve-installer] Function started', { timestamp: new Date().toISOString(), requestId, method: req.method });

  // Health check
  if (req.method === 'GET' && new URL(req.url).pathname === '/serve-installer') {
    const healthy = true; // env already validated by requireEnv
    return new Response(
      JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString(), service: 'serve-installer', checks: { env_vars: healthy } }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  try {
    return await withTimeout(async () => {
      logger.debug(`[${requestId}] ${getVersionInfo()}`);

      const url = new URL(req.url);
      const enrollmentKey = url.pathname.split('/').pop();

      // Rate limiting
      const clientIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateLimitResult = await checkRateLimit(supabaseClient, clientIp, 'serve-installer', { maxRequests: 10, windowMinutes: 60, blockMinutes: 30 });
      if (!rateLimitResult.allowed) {
        logger.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIp}`, { resetAt: rateLimitResult.resetAt });
        return new Response(
          JSON.stringify({ error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.', retryAfter: rateLimitResult.resetAt?.toISOString() }),
          { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': rateLimitResult.resetAt ? Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString() : '1800' } },
        );
      }

      // Validate mode
      const mode = url.searchParams.get('mode') || 'args';
      if (mode !== 'args' && mode !== 'envvars') {
        return new Response(JSON.stringify({ error: 'Invalid mode parameter. Use ?mode=args or ?mode=envvars' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }

      if (!enrollmentKey) {
        return new Response('Enrollment key is required', { status: 400, headers: buildCorsHeaders(origin) });
      }

      // Hash enrollment key
      const keyHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(enrollmentKey));
      const enrollmentKeyHash = Array.from(new Uint8Array(keyHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // Fetch enrollment key
      const { data: enrollmentData, error: enrollmentError } = await supabaseClient
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
      const resolveResult = await resolveAgent(supabaseClient, enrollmentData, enrollmentKeyHash, url, requestId, origin);
      if (resolveResult instanceof Response) return resolveResult;
      const { agentId, agentData } = resolveResult;

      // Generate fresh token
      const freshAgentToken = crypto.randomUUID();
      const freshTokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(freshAgentToken));
      const freshTokenHash = Array.from(new Uint8Array(freshTokenHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const freshTokenPrefix = freshAgentToken.substring(0, 8);

      await supabaseClient.from('agent_tokens').update({ is_active: false }).eq('agent_id', agentId);

      const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const { error: tokenInsertError } = await supabaseClient.from('agent_tokens').insert({
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
      const buildResult = await buildInstallerScript(
        supabaseClient, platform, mode as 'args' | 'envvars',
        agentData, freshAgentToken, SUPABASE_URL, requestId, origin,
      );
      if (buildResult instanceof Response) return buildResult;
      const { templateContent } = buildResult;

      // Validate installer
      const validationError = validateInstallerScript(templateContent, platform, agentData.agent_name, requestId, origin);
      if (validationError) return validationError;
      validateNoPlaceholders(templateContent, platform, requestId);

      // Persist hash & track
      const { sha256, sizeBytes } = await persistInstallerHash(supabaseClient, templateContent, enrollmentKey, requestId);
      await trackDownloadEvent(supabaseClient, enrollmentData.tenant_id, agentId, agentData.agent_name, platform, sha256, sizeBytes, req, requestId);

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
});
