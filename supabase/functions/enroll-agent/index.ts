/**
 * enroll-agent - Agent enrollment endpoint
 * REFACTORED: Uses enroll_agent_atomic RPC for transaction integrity and quota enforcement.
 */
import { EnrollAgentSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { logger } from '../_shared/logger.ts';
import { hashToken, getTokenPrefix } from '../_shared/token-hash.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { hashEnrollmentKey } from './key-validator.ts';
import { servePublic } from '../_shared/serve-public.ts';
import { handleValidationError } from '../_shared/error-handler.ts';

servePublic(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, body: rawData } = ctx;
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

    const { enrollmentKey, agentName, agentVersion, supportsHmac, metadataHash } = validation.data;

    // PR-5: HMAC Sunset Policy
    if (supportsHmac !== true) {
      const { data: flags } = await supabase.from('feature_flags').select('enabled').eq('key', 'enforce_hmac_enrollment').eq('enabled', true).limit(1);
      if (flags && flags.length > 0) {
        await createAuditLog({ supabase, tenantId: 'unknown', action: 'agent_enrollment_rejected_no_hmac', resourceType: 'agent', resourceId: agentName, details: { reason: 'hmac_not_supported', agentVersion: agentVersion ?? 'unknown' }, request: req, success: false });
        return new Response(JSON.stringify({ error: 'Agent version does not support HMAC authentication. Please upgrade to v5.0.12+.', code: 'HMAC_REQUIRED', requestId }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // Prepare credentials
    const agentToken = `cs_${crypto.randomUUID().replace(/-/g, '')}`;
    const hmacSecret = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const tokenHash = await hashToken(agentToken);
    const tokenPrefix = getTokenPrefix(agentToken);
    const enrollmentKeyHash = await hashEnrollmentKey(enrollmentKey);
    
    // AUDIT-FIX: Fetch tenant policy for token expiration
    const { data: keyInfo } = await supabase.from('enrollment_keys').select('tenant_id').eq('key_hash', enrollmentKeyHash).single();
    if (!keyInfo?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Invalid enrollment key', code: 'INVALID_KEY', requestId }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    const { data: policy } = await supabase.from('tenant_security_policies').select('token_expiry_days').eq('tenant_id', keyInfo.tenant_id).maybeSingle();
    
    const expiryDays = policy?.token_expiry_days || 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // CALL ATOMIC RPC
    const { data: result, error: rpcError } = await supabase.rpc('enroll_agent_atomic', {
      p_key_hash: enrollmentKeyHash,
      p_agent_name: agentName,
      p_hmac_secret: hmacSecret,
      p_token_hash: tokenHash,
      p_token_prefix: tokenPrefix,
      p_expires_at: expiresAt.toISOString(),
      p_metadata_hash: metadataHash || null
    });

    if (rpcError || !result || !result.success) {
      const errorMsg = result?.error || rpcError?.message || 'Enrollment failed';
      const errorCode = result?.error || 'RPC_ERROR';
      
      logger.error(`[${requestId}] Enrollment RPC failed: ${errorMsg}`, { rpcError, result });
      
      await createAuditLog({ 
        supabase, 
        tenantId: result?.tenant_id || 'unknown', 
        action: 'agent_enrollment_failed', 
        resourceType: 'agent', 
        resourceId: agentName, 
        details: { reason: errorCode, error: errorMsg }, 
        request: req, 
        success: false 
      });

      return new Response(JSON.stringify({ error: errorMsg, code: errorCode, requestId }), { 
        status: errorCode === 'QUOTA_EXCEEDED' ? 429 : 403, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      });
    }

    // Success Audit Log
    await createAuditLog({ 
      supabase, 
      tenantId: result.tenant_id, 
      action: 'agent_enrolled', 
      resourceType: 'agent', 
      resourceId: agentName, 
      details: { tenant_id: result.tenant_id, agent_id: result.agent_id }, 
      request: req, 
      success: true 
    });

    logger.success(`[${requestId}] Agent enrolled successfully: ${agentName} (${result.agent_id})`);
    
    return { 
      agentToken, 
      hmacSecret, 
      expiresAt: expiresAt.toISOString(),
      metadataHash: metadataHash || null,
      requestId 
    };

  } catch (error) {
    logger.error(`[${requestId}] Unexpected error in enroll-agent`, error);
    return new Response(JSON.stringify({ error: 'Internal server error', requestId }), { 
      status: 500, 
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
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