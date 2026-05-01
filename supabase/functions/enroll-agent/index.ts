// @ts-nocheck
/**
 * enroll-agent - Agent enrollment endpoint
 * MODULARIZED: Logic extracted to key-validator.ts and agent-handler.ts
 * 
 * Auth: Deno.serve (raw body needed for HMAC sunset policy checks)
 */
import { requireEnv } from '../_shared/env.ts';
import { createTypedClient } from '../_shared/supabase-client.ts';
import { handleExceptionWithContext, handleValidationError } from '../_shared/error-handler.ts';
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
import { withTimeout } from '../_shared/timeout.ts';

import { servePublic } from '../_shared/serve-public.ts';

servePublic(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, body: rawData } = ctx;
  const traceId = requestId;
  const startTime = Date.now();
  const origin = req.headers.get("origin");

  logger.info(`[${requestId}] Starting enrollment request`);

  try {
    const supabase = supabaseAny;

    if (!rawData || typeof rawData !== 'object' || !('enrollmentKey' in rawData)) {
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
    const { data: existingAgent } = await supabase.from('agents').select('id').eq('agent_name', agentName).eq('tenant_id', keyData.tenant_id).order('enrolled_at', { ascending: false }).limit(1).maybeSingle();

    if (!existingAgent) {
      const quotaCheck = await checkQuotaAvailable(supabase, keyData.tenant_id, 'max_agents');
      if (!quotaCheck.allowed) {
        await createAuditLog({ supabase, tenantId: keyData.tenant_id, action: 'agent_enrollment_failed', resourceType: 'agent', resourceId: agentName, details: { reason: 'quota_exceeded', quota_used: quotaCheck.current, quota_limit: quotaCheck.limit }, request: req, success: false });
        return new Response(JSON.stringify({ error: quotaCheck.error || 'Quota de agentes excedida', quotaUsed: quotaCheck.current, quotaLimit: quotaCheck.limit }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // 1. Update key usage (Atomic via RPC) - DO THIS FIRST to validate and secure slot
    const { data: updateResult, error: updateError } = await supabase.rpc('increment_enrollment_key_usage', {
      p_key_id: keyData.id,
      p_agent_name: agentName
    });

    if (updateError || !updateResult.success) {
      logger.error(`[${requestId}] Failed to authorize enrollment key usage: ${updateError?.message || updateResult?.error}`);
      return new Response(JSON.stringify({ 
        error: updateResult?.error || 'Failed to authorize enrollment key usage', 
        code: updateError?.code === 'PGRST202' ? 'RPC_NOT_FOUND' : 'KEY_UPDATE_FAILED', 
        requestId 
      }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // 2. Generate credentials
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

    // 3. Create token
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const tokenHash = await hashToken(agentToken);
    const tokenPrefix = getTokenPrefix(agentToken);
    await supabase.from('agent_tokens').insert({ agent_id: agentId, token_hash: tokenHash, token_prefix: tokenPrefix, expires_at: expiresAt.toISOString() });

    // Update key usage (Atomic via RPC to prevent race conditions)
    const { data: updateResult, error: updateError } = await supabase.rpc('increment_enrollment_key_usage', {
      p_key_id: keyData.id,
      p_agent_name: agentName
    });

    if (updateError || !updateResult.success) {
      logger.error(`[${requestId}] Failed to update key usage: ${updateError?.message || updateResult?.error}`);
      // If it's a new agent and key update fails, we should probably stop (unless it's already used)
      if (!existingAgent) {
        return new Response(JSON.stringify({ error: updateResult?.error || 'Failed to authorize enrollment key usage', code: 'KEY_UPDATE_FAILED' }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // Audit log
    await createAuditLog({ supabase, tenantId: keyData.tenant_id, action: 'agent_enrolled', resourceType: 'agent', resourceId: agentName, details: { tenant_id: keyData.tenant_id, enrollment_key_id: keyData.id, is_new: !existingAgent }, request: req, success: true });

    logger.success(`[${requestId}] Agent enrolled successfully`);
    return { agentToken, hmacSecret, expiresAt: expiresAt.toISOString(), requestId };

  } catch (error) {
    return handleExceptionWithContext(error, requestId, 'enroll-agent', startTime, {
      tenantId: 'unknown', // Set later if available, but mandatory here
    });
  }
}, {
  rateLimit: {
    endpoint: 'enroll-agent',
    maxRequests: 5,
    windowMinutes: 60,
    blockMinutes: 60,
  }
});