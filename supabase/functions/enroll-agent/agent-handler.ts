/**
 * Agent creation and re-enrollment logic
 * Extraído de enroll-agent/index.ts para modularização
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { createAuditLog } from '../_shared/audit.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface AgentHandlerResult {
  success: boolean;
  agentId?: string;
  response?: Response;
}

/**
 * Handles re-enrollment of an existing agent via RPC with cross-tenant validation.
 */
export async function handleReEnrollment(
  supabase: any,
  existingAgentId: string,
  agentName: string,
  hmacSecret: string,
  tenantId: string,
  enrollmentKey: string,
  requestId: string,
  req: Request,
  origin: string | null,
): Promise<AgentHandlerResult> {
  // ADR-029 CRIT-06: Usar RPC revive_agent_on_reenroll
  const { data: reviveResult, error: reviveError } = await supabase.rpc('revive_agent_on_reenroll', {
    p_agent_id: existingAgentId,
    p_new_hmac_secret: hmacSecret,
    p_expected_tenant_id: tenantId,
  });

  // ADR-029 CRIT-06: Tratamento de tentativa cross-tenant
  if (reviveResult?.error === 'TENANT_MISMATCH') {
    logger.error(`[${requestId}] SECURITY: Cross-tenant attack attempt detected!`, {
      agent_id: existingAgentId,
      expected_tenant: tenantId,
      enrollment_key: enrollmentKey.substring(0, 8) + '...',
    });

    await createAuditLog({
      supabase,
      tenantId,
      action: 'agent_reenroll_cross_tenant_blocked',
      resourceType: 'agent',
      resourceId: existingAgentId,
      details: { reason: 'cross_tenant_attack_blocked', agent_name: agentName, expected_tenant_id: tenantId },
      request: req,
      success: false,
    });

    return {
      success: false,
      response: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Agent belongs to different tenant' }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      ),
    };
  }

  if (reviveError) {
    logger.warn(`[${requestId}] Failed to revive agent via RPC, falling back with cross-tenant validation`, reviveError);

    // V-606 FIX: Validar tenant ANTES do fallback
    const { data: existingAgentFull, error: fetchError } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('id', existingAgentId)
      .single();

    if (fetchError || !existingAgentFull) {
      logger.error(`[${requestId}] Failed to fetch agent for fallback validation`);
      return {
        success: false,
        response: new Response(
          JSON.stringify({ error: 'Agent not found during fallback', code: 'AGENT_NOT_FOUND' }),
          { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        ),
      };
    }

    // V-606 FIX: Cross-tenant validation
    if (existingAgentFull.tenant_id !== tenantId) {
      logger.error(`[${requestId}] SECURITY: Cross-tenant attack blocked in fallback path!`, {
        agent_id: existingAgentId,
        agent_tenant: existingAgentFull.tenant_id,
        key_tenant: tenantId,
      });

      await createAuditLog({
        supabase,
        tenantId,
        action: 'agent_reenroll_cross_tenant_blocked',
        resourceType: 'agent',
        resourceId: existingAgentId,
        details: { reason: 'cross_tenant_attack_blocked_fallback', agent_name: agentName, expected_tenant_id: tenantId },
        request: req,
        success: false,
      });

      return {
        success: false,
        response: new Response(
          JSON.stringify({ success: false, error: 'Unauthorized: Agent belongs to different tenant' }),
          { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        ),
      };
    }

    await createAuditLog({
      supabase,
      tenantId,
      action: 'agent_reenroll_rpc_fallback',
      resourceType: 'agent',
      resourceId: agentName,
      details: { reason: 'rpc_revive_failed', error: reviveError.message, agent_id: existingAgentId, fallback_method: 'direct_update_validated' },
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
        archived_reason: null,
      })
      .eq('id', existingAgentId);

    // Deactivate old tokens
    await supabase
      .from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', existingAgentId);
  }

  logger.info(`[${requestId}] Agent revived for reenrollment: ${agentName}`);
  return { success: true, agentId: existingAgentId };
}

/**
 * Creates a new agent record.
 */
export async function createNewAgent(
  supabase: any,
  tenantId: string,
  agentName: string,
  hmacSecret: string,
): Promise<string> {
  const { data: newAgent } = await supabase.from('agents').insert({
    tenant_id: tenantId,
    agent_name: agentName,
    hmac_secret: hmacSecret,
    status: 'active',
  }).select('id')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return newAgent!.id;
}
