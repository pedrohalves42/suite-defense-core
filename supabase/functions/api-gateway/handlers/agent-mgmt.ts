/**
 * Agent management handlers — inlined from standalone functions (Phase 2E).
 * Simple DB operations previously proxied via api-gateway.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

type SB = any;

/** agent-snapshot: Returns unified agent snapshot via RPC */
export async function handleAgentSnapshot(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const agentId = payload.agent_id as string;
  if (!agentId || typeof agentId !== 'string') {
    return { error: 'Invalid payload: agent_id (UUID) required', __status: 400 };
  }

  const { data: snapshot, error } = await supabase.rpc('get_agent_snapshot', { p_agent_id: agentId });
  if (error) {
    logger.error('[agent-snapshot][RPC_ERROR]', { error, agentId, requestId });
    return { error: 'Failed to fetch agent snapshot', correlation_id: requestId, __status: 500 };
  }
  if (!snapshot) return { error: 'Agent not found or access denied', correlation_id: requestId, __status: 404 };

  return { data: { ...snapshot, meta: { correlation_id: requestId, snapshot_at: new Date().toISOString() } } };
}

/** check-agent-name-availability: Checks if agent name is free within tenant */
export async function handleCheckAgentNameAvailability(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const agentName = payload.agentName as string;
  if (!agentName || agentName.length < 3 || agentName.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(agentName)) {
    return { available: false, reason: 'Nome invalido: 3-50 chars, apenas letras/numeros/hifen/underscore' };
  }

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: ctx?.userId });
  const tenantId = (isSuperAdmin && (payload.tenant_id as string)) || ctx?.tenantId;
  if (!tenantId) return { available: false, reason: 'Tenant context required', __status: 400 };

  const { data: existing, error } = await supabase
    .from('agents').select('id').eq('agent_name', agentName).eq('tenant_id', tenantId).maybeSingle();
  if (error) return { available: false, reason: 'Erro ao verificar disponibilidade', __status: 500 };

  return { available: !existing, reason: existing ? 'Nome ja esta em uso neste tenant' : null };
}

/** diagnose-agent: Runs diagnostic RPC for an agent */
export async function handleDiagnoseAgent(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const agentName = payload.agent_name as string;
  if (!agentName || typeof agentName !== 'string') {
    return { error: 'agent_name is required', __status: 400 };
  }

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: ctx?.userId });
  const tenantId = (isSuperAdmin && (payload.tenant_id as string)) || ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant context required for diagnosis', __status: 400 };

  const { data: diagnosis, error } = await supabase.rpc('diagnose_agent', { 
    p_agent_name: agentName,
    p_tenant_id: tenantId
  });

  if (error) {
    logger.error('[diagnose-agent] Failed', { requestId, error: error.message });
    return { error: 'Failed to run diagnosis', details: error.message, __status: 500 };
  }
  return diagnosis;
}

/** get-agent-timeline: Fetches timeline events for an agent */
export async function handleGetAgentTimeline(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const agentId = payload.agent_id as string;
  if (!agentId) return { error: 'agent_id required', __status: 400 };

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: ctx?.userId });
  const tenantId = (isSuperAdmin && (payload.tenant_id as string)) || ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant context required', __status: 400 };

  // Verify agent belongs to tenant
  const { data: agent, error: agentError } = await supabase
    .from('agents').select('id, agent_name').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle();
  if (agentError || !agent) return { error: 'Agent not found or access denied', __status: 404 };

  const { data: events, error } = await supabase
    .from('agent_timeline_events').select('id, agent_id, event_type, event_time, description, severity, metadata').eq('agent_id', agentId)
    .order('event_time', { ascending: false }).limit(200);
  if (error) return { error: 'Failed to fetch timeline', __status: 500 };

  return { success: true, agent_id: agentId, agent_name: agent.agent_name, events: events || [] };
}
