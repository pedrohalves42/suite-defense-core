/**
 * enroll-agent - Agent enrollment endpoint
 * MODULARIZED: Logic extracted to key-validator.ts and agent-handler.ts
 * 
 * Auth: Deno.serve (raw body needed for HMAC sunset policy checks)
 */
import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, handleValidationError } from '../_shared/error-handler.ts';
import { EnrollAgentSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { checkQuotaAvailable } from '../_shared/quota.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken, getTokenPrefix } from '../_shared/token-hash.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { validateEnrollmentKey } from './key-validator.ts';
import { handleReEnrollment, createNewAgent } from './agent-handler.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

  logger.info(`[${requestId}] Starting enrollment request`);

  try {
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateLimitResult = await checkRateLimit(supabase, clientIp, 'enroll-agent', { maxRequests: 5, windowMinutes: 60, blockMinutes: 60 });
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas de enrollment. Tente novamente mais tarde.', resetAt: rateLimitResult.resetAt }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Parse and validate input
    let rawData;
    try { rawData = await req.json(); } catch (e) {
      return handleValidationError('Invalid JSON in request body', { error: e instanceof Error ? e.message : 'Invalid JSON' }, requestId);
    }

    if (!rawData?.enrollmentKey) {
      return new Response(JSON.stringify({ error: 'enrollmentKey is required', code: 'MISSING_ENROLLMENT_KEY', requestId }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const validation = EnrollAgentSchema.safeParse(rawData);
    if (!validation.success) return handleValidationError(validation.error, undefined, requestId);

    const { enrollmentKey, agentName, agentVersion, supportsHmac } = validation.data;

    // PR-5: HMAC Sunset Policy
    if (supportsHmac !== true) {
      const { data: flags } = await supabase.from('feature_flags').select('enabled').eq('key', 'enforce_hmac_enrollment').eq('enabled', true).limit(1);
      if (flags && flags.length > 0) {
        await createAuditLog({ supabase, tenantId: 'unknown', action: 'agent_enrollment_rejected_no_hmac', resourceType: 'agent', resourceId: agentName, details: { reason: 'hmac_not_supported', agentVersion: agentVersion ?? 'unknown' }, request: req, success: false });
        return new Response(JSON.stringify({ error: 'Agent version does not support HMAC authentication. Please upgrade to v5.0.12+.', code: 'HMAC_REQUIRED', requestId }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // Validate enrollment key
    const keyResult = await validateEnrollmentKey(supabase, enrollmentKey, agentName, requestId, req, origin);
    if (!keyResult.valid) return keyResult.response!;
    const keyData = keyResult.keyData!;

    // Check agent quota (new agents only)
    const { data: existingAgent } = await supabase.from('agents').select('id').eq('agent_name', agentName).order('enrolled_at', { ascending: false }).limit(1).maybeSingle();

    if (!existingAgent) {
      const quotaCheck = await checkQuotaAvailable(supabase, keyData.tenant_id, 'max_agents');
      if (!quotaCheck.allowed) {
        await createAuditLog({ supabase, tenantId: keyData.tenant_id, action: 'agent_enrollment_failed', resourceType: 'agent', resourceId: agentName, details: { reason: 'quota_exceeded', quota_used: quotaCheck.current, quota_limit: quotaCheck.limit }, request: req, success: false });
        return new Response(JSON.stringify({ error: quotaCheck.error || 'Quota de agentes excedida', quotaUsed: quotaCheck.current, quotaLimit: quotaCheck.limit }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // Generate credentials
    const agentToken = crypto.randomUUID();
    const hmacSecret = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

    let agentId: string;
    if (existingAgent) {
      const reEnrollResult = await handleReEnrollment(supabase, existingAgent.id, agentName, hmacSecret, keyData.tenant_id, enrollmentKey, requestId, req, origin);
      if (!reEnrollResult.success) return reEnrollResult.response!;
      agentId = reEnrollResult.agentId!;
    } else {
      agentId = await createNewAgent(supabase, keyData.tenant_id, agentName, hmacSecret);
    }

    // Create token
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const tokenHash = await hashToken(agentToken);
    const tokenPrefix = getTokenPrefix(agentToken);
    await supabase.from('agent_tokens').insert({ agent_id: agentId, token_hash: tokenHash, token_prefix: tokenPrefix, expires_at: expiresAt.toISOString() });

    // Update key usage
    const updateData: Record<string, any> = { current_uses: keyData.current_uses + 1, used_by_agent: agentName, used_at: new Date().toISOString() };
    if (keyData.current_uses === 0) {
      const newExpiration = new Date(); newExpiration.setDate(newExpiration.getDate() + 30);
      updateData.expires_at = newExpiration.toISOString();
    }
    await supabase.from('enrollment_keys').update(updateData).eq('id', keyData.id);

    // Audit log
    await createAuditLog({ supabase, tenantId: keyData.tenant_id, action: 'agent_enrolled', resourceType: 'agent', resourceId: agentName, details: { tenant_id: keyData.tenant_id, enrollment_key_id: keyData.id, is_new: !existingAgent }, request: req, success: true });

    logger.success(`[${requestId}] Agent enrolled successfully`);
    return new Response(JSON.stringify({ agentToken, hmacSecret, expiresAt: expiresAt.toISOString(), requestId }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    logger.error(`[${requestId}] Enrollment failed after ${Date.now() - startTime}ms`, error);
    return handleException(error, requestId, 'enroll-agent');
  }
});
