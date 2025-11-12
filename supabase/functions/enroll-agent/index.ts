import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { EnrollAgentSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { checkQuotaAvailable } from '../_shared/quota.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  logger.info(`[${requestId}] Starting enrollment request`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting por IP (prevenir brute force)
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateLimitResult = await checkRateLimit(supabase, clientIp, 'enroll-agent', {
      maxRequests: 5,
      windowMinutes: 60,
      blockMinutes: 60,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Muitas tentativas de enrollment. Tente novamente mais tarde.',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input with better error handling
    let rawData;
    try {
      rawData = await req.json();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Invalid JSON';
      logger.error(`[${requestId}] Invalid JSON`, e);
      return handleValidationError('Invalid JSON in request body', { error: errorMsg }, requestId);
    }

    logger.debug(`[${requestId}] Enrollment request received`, {
      hasEnrollmentKey: !!rawData?.enrollmentKey,
      agentName: rawData?.agentName || 'MISSING'
    });

    // FASE 1: Explicit check for missing enrollmentKey
    if (!rawData?.enrollmentKey) {
      logger.warn(`[${requestId}] Missing enrollmentKey in request`);
      return new Response(
        JSON.stringify({ 
          error: 'enrollmentKey is required',
          code: 'MISSING_ENROLLMENT_KEY',
          requestId 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = EnrollAgentSchema.safeParse(rawData);
    if (!validation.success) {
      logger.warn(`[${requestId}] Validation error`, {
        errors: validation.error.issues.length,
        hasKey: !!rawData?.enrollmentKey,
        hasName: !!rawData?.agentName
      });
      return handleValidationError(validation.error, undefined, requestId);
    }

    const { enrollmentKey, agentName } = validation.data;

    // Validate enrollment key
    const { data: keyData, error: keyError } = await supabase
      .from('enrollment_keys')
      .select('*')
      .eq('key', enrollmentKey)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (keyError || !keyData) {
      logger.warn(`[${requestId}] Invalid enrollment key`);
      await createAuditLog({
        supabase,
        tenantId: 'unknown',
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'invalid_key', key: enrollmentKey },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          error: 'Chave de enrollment inválida ou não encontrada',
          code: 'INVALID_ENROLLMENT_KEY',
          requestId
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (new Date(keyData.expires_at) < new Date()) {
      logger.warn(`[${requestId}] Expired enrollment key`);
      await createAuditLog({
        supabase,
        tenantId: keyData.tenant_id,
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'expired_key', key_id: keyData.id, expired_at: keyData.expires_at },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          error: 'Chave de enrollment expirada',
          code: 'EXPIRED_ENROLLMENT_KEY',
          expiredAt: keyData.expires_at,
          requestId
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check usage limit
    if (keyData.max_uses !== null && keyData.current_uses >= keyData.max_uses) {
      logger.warn(`[${requestId}] Key usage limit exceeded`);
      await createAuditLog({
        supabase,
        tenantId: keyData.tenant_id,
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'max_uses_exceeded', key_id: keyData.id, current: keyData.current_uses, max: keyData.max_uses },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          error: 'Limite de uso da chave atingido',
          code: 'KEY_USAGE_EXCEEDED',
          currentUses: keyData.current_uses,
          maxUses: keyData.max_uses,
          requestId
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check agent quota before allowing enrollment
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Only check quota for new agents (not re-enrollments)
    if (!existingAgent) {
      const quotaCheck = await checkQuotaAvailable(supabase, keyData.tenant_id, 'max_agents');
      
      if (!quotaCheck.allowed) {
        await createAuditLog({
          supabase,
          tenantId: keyData.tenant_id,
          action: 'agent_enrollment_failed',
          resourceType: 'agent',
          resourceId: agentName,
          details: { 
            reason: 'quota_exceeded', 
            quota_used: quotaCheck.current,
            quota_limit: quotaCheck.limit 
          },
          request: req,
          success: false,
        });

        return new Response(
          JSON.stringify({ 
            error: quotaCheck.error || 'Quota de agentes excedida',
            quotaUsed: quotaCheck.current,
            quotaLimit: quotaCheck.limit
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate agent token and HMAC secret
    const agentToken = crypto.randomUUID();
    const hmacSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    let agentId: string;

    if (existingAgent) {
      // Update existing agent
      await supabase
        .from('agents')
        .update({ hmac_secret: hmacSecret })
        .eq('agent_name', agentName);
      
      agentId = existingAgent.id;

      // Deactivate old tokens
      await supabase
        .from('agent_tokens')
        .update({ is_active: false })
        .eq('agent_id', agentId);
    } else {
      // Insert new agent
      const { data: newAgent } = await supabase.from('agents').insert({
        tenant_id: keyData.tenant_id,
        agent_name: agentName,
        hmac_secret: hmacSecret,
        status: 'active',
      }).select('id')
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
      agentId = newAgent!.id;
    }

    // Create token in dedicated table
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await supabase.from('agent_tokens').insert({
      agent_id: agentId,
      token: agentToken,
      expires_at: expiresAt.toISOString(),
    });

    // Increment key usage
    await supabase
      .from('enrollment_keys')
      .update({ current_uses: keyData.current_uses + 1 })
      .eq('id', keyData.id);

    // Create audit log
    await createAuditLog({
      supabase,
      tenantId: keyData.tenant_id,
      action: 'agent_enrolled',
      resourceType: 'agent',
      resourceId: agentName,
      details: {
        tenant_id: keyData.tenant_id,
        enrollment_key_id: keyData.id,
        is_new: !existingAgent,
      },
      request: req,
      success: true,
    });

    const duration = Date.now() - startTime;
    logger.debug(`[${requestId}] Enrollment completed`, { duration, isNew: !existingAgent });
    logger.success(`[${requestId}] Agent enrolled successfully`);

    return new Response(
      JSON.stringify({
        agentToken,
        hmacSecret,
        expiresAt: expiresAt.toISOString(),
        requestId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] Enrollment failed after ${duration}ms`, error);
    return handleException(error, requestId, 'enroll-agent');
  }
});
