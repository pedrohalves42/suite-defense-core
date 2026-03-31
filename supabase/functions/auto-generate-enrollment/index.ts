/**
 * auto-generate-enrollment — Migrated to serveTenant middleware
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { AutoGenerateEnrollmentSchema } from '../_shared/validation.ts';
import { handleValidationError } from '../_shared/error-handler.ts';
import { logSecurityEvent, extractIpAddress, checkIpBlocklist } from '../_shared/security-log.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { withAPM } from '../_shared/apm.ts';
import { generateEnrollmentKey, sha256Hex, generateHmacSecret, validateHmacSecret } from './key-generator.ts';
import { resolveOrCreateAgent, createAgentToken, linkEnrollmentKey } from './agent-manager.ts';

serveTenant(async (req, ctx) => {
  const { supabase, userId, tenantId, requestId, body } = ctx;
  const origin = req.headers.get('origin');
  const startTime = Date.now();

  return withAPM('auto-generate-enrollment', 'edge_function', async () => {
    try {
      return await withTimeout(async () => {
        const ipAddress = extractIpAddress(req);

        // IP blocklist check (non-blocking)
        try {
          const ipBlockCheck = await checkIpBlocklist(supabase, ipAddress, 'auto-generate-enrollment', 60);
          if (ipBlockCheck.blocked) {
            await logSecurityEvent({ supabase, ipAddress, endpoint: 'auto-generate-enrollment', attackType: 'brute_force', severity: 'high', blocked: true, details: { reason: ipBlockCheck.reason, resetAt: ipBlockCheck.resetAt }, userAgent: req.headers.get('user-agent') || undefined, requestId });
            return new Response(JSON.stringify({ error: 'Too many requests', message: ipBlockCheck.reason, resetAt: ipBlockCheck.resetAt, requestId, timestamp: new Date().toISOString() }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
          }
        } catch (blocklistError) {
          logger.warn(`[${requestId}] IP blocklist check failed (non-blocking)`, (blocklistError as Error).message);
        }

        // Rate limiting (non-blocking)
        try {
          const rateLimitResult = await checkRateLimit(supabase, ipAddress, 'auto-generate-enrollment', { maxRequests: 20, windowMinutes: 1, blockMinutes: 2 });
          if (!rateLimitResult.allowed) {
            await logSecurityEvent({ supabase, ipAddress, endpoint: 'auto-generate-enrollment', attackType: 'rate_limit', severity: 'medium', blocked: true, details: { resetAt: rateLimitResult.resetAt }, userAgent: req.headers.get('user-agent') || undefined, requestId });
            return new Response(JSON.stringify({ error: 'Rate limit exceeded', message: 'Too many enrollment key creation attempts.', resetAt: rateLimitResult.resetAt, requestId, timestamp: new Date().toISOString() }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
          }
        } catch (rateLimitError) {
          logger.warn(`[${requestId}] Rate limit check failed (non-blocking)`, (rateLimitError as Error).message);
        }

        // Validate body
        const validation = AutoGenerateEnrollmentSchema.safeParse(body);
        if (!validation.success) {
          await logSecurityEvent({ supabase, tenantId, userId: userId!, ipAddress, endpoint: 'auto-generate-enrollment', attackType: 'invalid_input', severity: 'medium', blocked: true, details: { errors: validation.error.issues, input: body }, userAgent: req.headers.get('user-agent') || undefined, requestId });
          return handleValidationError(validation.error, undefined, requestId);
        }

        const { agentName, platform } = validation.data;
        const ipAddress2 = extractIpAddress(req);

        // Generate credentials
        const enrollmentKey = generateEnrollmentKey();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const enrollmentKeyHash = await sha256Hex(enrollmentKey);
        const agentToken = crypto.randomUUID();
        const hmacSecret = generateHmacSecret();

        const hmacValid = await validateHmacSecret(hmacSecret, requestId);
        logger.info(`[${requestId}] HMAC secret auto-validation: ${hmacValid ? 'PASSED' : 'FAILED'}`);

        // Store enrollment key
        const { error: keyError } = await supabase.from('enrollment_keys').insert({ key_hash: enrollmentKeyHash, tenant_id: tenantId, created_by: userId, expires_at: expiresAt.toISOString(), max_uses: 1, current_uses: 0, is_active: true, description: `Auto-generated for ${agentName}` });
        if (keyError) {
          if (keyError.code === '23505') throw new Error('Enrollment key already exists. Please try again.');
          throw new Error(`Failed to create enrollment key: ${keyError.message}`);
        }

        // Resolve or create agent
        const agentResult = await resolveOrCreateAgent({ supabase, requestId, userId: userId!, tenantId, agentName, platform, hmacSecret, ipAddress: ipAddress2, origin });
        if (agentResult.error) return agentResult.error;
        const agentId = agentResult.agentId;

        await createAgentToken(supabase, agentId, agentToken, requestId);
        await linkEnrollmentKey(supabase, enrollmentKeyHash, agentId, agentName, requestId);

        const { data: enrollmentData } = await supabase.from('enrollment_keys').select('installer_sha256, installer_size_bytes').eq('key', enrollmentKey).maybeSingle();

        const duration = Date.now() - startTime;
        logger.info(`[${requestId}] Successfully generated credentials for agent ${agentName} in ${duration}ms`);

        return {
          enrollmentKey, agentToken, hmacSecret, expiresAt: expiresAt.toISOString(),
          tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          agentId, installerSha256: enrollmentData?.installer_sha256 || null,
          installerSizeBytes: enrollmentData?.installer_size_bytes || null,
          requestId, timestamp: new Date().toISOString()
        };
      }, { timeoutMs: 25000, timeoutMessage: 'Auto-generate enrollment request timeout' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.error('Request timeout in auto-generate-enrollment', { requestId });
        return createTimeoutResponse(buildCorsHeaders(origin));
      }
      throw error;
    }
  }, { metadata: { request_id: requestId } });
});
