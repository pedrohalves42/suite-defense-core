import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { EnrollAgentSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { checkQuotaAvailable } from '../_shared/quota.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken, getTokenPrefix } from '../_shared/token-hash.ts';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // QUAL-01: Proper HTTP method validation
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }
  
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

  logger.info(`[${requestId}] Starting enrollment request`);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
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

    // P1 SEC-001 FIX: Validate enrollment key by hash (not plaintext)
    // Hash the incoming key and compare with stored hash
    const keyHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(enrollmentKey)
    );
    const enrollmentKeyHash = Array.from(new Uint8Array(keyHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { data: keyData, error: keyError } = await supabase
      .from('enrollment_keys')
      .select('*')
      .eq('key_hash', enrollmentKeyHash)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (keyError || !keyData) {
      logger.warn(`[${requestId}] Invalid enrollment key`);
      // ADR-026 FIX: Never log plaintext enrollmentKey - use masked prefix only
      await createAuditLog({
        supabase,
        tenantId: 'unknown',
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'invalid_key', key_prefix: getTokenPrefix(enrollmentKey) },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          error: 'Chave de enrollment invalida ou nao encontrada',
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
      // CRITICAL FIX: Usar RPC revive_agent_on_reenroll para resetar estado completo
      // Isso garante que o agente volte a status='active' e limpe flags problemáticas
      // ADR-029 CRIT-06: Passar p_expected_tenant_id para validação cross-tenant
      const { data: reviveResult, error: reviveError } = await supabase.rpc('revive_agent_on_reenroll', {
        p_agent_id: existingAgent.id,
        p_new_hmac_secret: hmacSecret,
        p_expected_tenant_id: keyData.tenant_id  // ADR-029 CRIT-06: Validação cross-tenant
      });

      // ADR-029 CRIT-06: Tratamento de tentativa cross-tenant
      if (reviveResult?.error === 'TENANT_MISMATCH') {
        logger.error(`[${requestId}] SECURITY: Cross-tenant attack attempt detected!`, {
          agent_id: existingAgent.id,
          expected_tenant: keyData.tenant_id,
          enrollment_key: enrollmentKey.substring(0, 8) + '...'
        });
        
        await createAuditLog({
          supabase,
          tenantId: keyData.tenant_id,
          action: 'agent_reenroll_cross_tenant_blocked',
          resourceType: 'agent',
          resourceId: existingAgent.id,
          details: { 
            reason: 'cross_tenant_attack_blocked',
            agent_name: agentName,
            expected_tenant_id: keyData.tenant_id
          },
          request: req,
          success: false,
        });
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Unauthorized: Agent belongs to different tenant' 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (reviveError) {
        logger.warn(`[${requestId}] Failed to revive agent via RPC, falling back with cross-tenant validation`, reviveError);
        
        // V-606 FIX: Validar tenant ANTES do fallback para prevenir cross-tenant attack
        const { data: existingAgentFull, error: fetchError } = await supabase
          .from('agents')
          .select('id, tenant_id')
          .eq('id', existingAgent.id)
          .single();
        
        if (fetchError || !existingAgentFull) {
          logger.error(`[${requestId}] Failed to fetch agent for fallback validation`);
          return new Response(
            JSON.stringify({ error: 'Agent not found during fallback', code: 'AGENT_NOT_FOUND' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // V-606 FIX: Cross-tenant validation
        if (existingAgentFull.tenant_id !== keyData.tenant_id) {
          logger.error(`[${requestId}] SECURITY: Cross-tenant attack blocked in fallback path!`, {
            agent_id: existingAgent.id,
            agent_tenant: existingAgentFull.tenant_id,
            key_tenant: keyData.tenant_id
          });
          
          await createAuditLog({
            supabase,
            tenantId: keyData.tenant_id,
            action: 'agent_reenroll_cross_tenant_blocked',
            resourceType: 'agent',
            resourceId: existingAgent.id,
            details: { 
              reason: 'cross_tenant_attack_blocked_fallback',
              agent_name: agentName,
              expected_tenant_id: keyData.tenant_id
            },
            request: req,
            success: false,
          });
          
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Unauthorized: Agent belongs to different tenant' 
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Audit log for fallback path (now safe)
        await createAuditLog({
          supabase,
          tenantId: keyData.tenant_id,
          action: 'agent_reenroll_rpc_fallback',
          resourceType: 'agent',
          resourceId: agentName,
          details: { 
            reason: 'rpc_revive_failed', 
            error: reviveError.message,
            agent_id: existingAgent.id,
            fallback_method: 'direct_update_validated'
          },
          request: req,
          success: true,
        });
        
        // Fallback seguro: tenant validado acima
        await supabase
          .from('agents')
          .update({ 
            hmac_secret: hmacSecret,
            status: 'active',
            last_heartbeat: null,
            is_throttled: false,
            is_isolated: false,
            safe_mode_entered_at: null,
            offline_detected_at: null,
            offline_reason: null,
            archived_at: null,
            archived_reason: null
          })
          .eq('id', existingAgent.id);
        
        // Deactivate old tokens
        await supabase
          .from('agent_tokens')
          .update({ is_active: false })
          .eq('agent_id', existingAgent.id);
      }
      
      agentId = existingAgent.id;
      logger.info(`[${requestId}] Agent revived for reenrollment: ${agentName}`);
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

    // Create token in dedicated table with hash
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // FASE 2: Armazenar token com hash
    const tokenHash = await hashToken(agentToken);
    const tokenPrefix = getTokenPrefix(agentToken);

    await supabase.from('agent_tokens').insert({
      agent_id: agentId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      expires_at: expiresAt.toISOString(),
    });

    // Increment key usage and extend expiration to 30 days after first use
    const isFirstUse = keyData.current_uses === 0;
    const updateData: Record<string, any> = { 
      current_uses: keyData.current_uses + 1,
      used_by_agent: agentName,
      used_at: new Date().toISOString()
    };
    
    // If first use, extend expiration to 30 days from now
    if (isFirstUse) {
      const newExpiration = new Date();
      newExpiration.setDate(newExpiration.getDate() + 30);
      updateData.expires_at = newExpiration.toISOString();
      logger.info(`[${requestId}] First use of key - extending expiration to 30 days: ${updateData.expires_at}`);
    }
    
    await supabase
      .from('enrollment_keys')
      .update(updateData)
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
