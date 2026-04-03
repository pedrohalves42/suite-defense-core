/**
 * Agent data query handlers — Phase 2F
 * Inlined: get-software-inventory, get-web-activity, get-agent-dashboard-data
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

type Supabase = ReturnType<typeof createClient>;

// ── get-software-inventory ─────────────────────────────────────────────
export async function handleGetSoftwareInventory(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = ctx?.tenantId;
  const agentId = payload.agent_id as string;
  if (!agentId) return { __status: 400, error: 'agent_id parameter required' };

  const { data: agent, error: agentError } = await supabase.from('agents')
    .select('id, agent_name, tenant_id').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle();
  if (agentError || !agent) return { __status: 404, error: 'Agent not found or access denied' };

  const { data: inventory, error: inventoryError } = await supabase.from('software_inventory')
    .select('*').eq('agent_id', agentId).order('name', { ascending: true });
  if (inventoryError) return { __status: 500, error: 'Failed to fetch inventory' };

  return { success: true, agent_id: agentId, agent_name: agent.agent_name, items: inventory || [] };
}

// ── get-web-activity ───────────────────────────────────────────────────
export async function handleGetWebActivity(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = ctx?.tenantId;
  const agentId = payload.agent_id as string;
  if (!agentId) return { __status: 400, error: 'agent_id parameter required' };

  const { data: agent, error: agentError } = await supabase.from('agents')
    .select('id, agent_name, tenant_id').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle();
  if (agentError || !agent) return { __status: 404, error: 'Agent not found or access denied' };

  // Try RPC first
  const { data: activity, error: rpcError } = await supabase.rpc('get_web_activity_aggregated', {
    p_agent_id: agentId, p_hours_back: 24,
  });

  if (!rpcError && activity) {
    return { success: true, agent_id: agentId, agent_name: agent.agent_name, items: activity };
  }

  // Fallback to raw query
  const { data: rawActivity, error: rawError } = await supabase.from('agent_web_activity')
    .select('domain, visited_at').eq('agent_id', agentId)
    .gte('visited_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('visited_at', { ascending: false }).limit(200);

  if (rawError) return { __status: 500, error: 'Failed to fetch web activity' };

  const aggregated = new Map<string, { first: string; last: string; count: number }>();
  for (const item of rawActivity || []) {
    const existing = aggregated.get(item.domain);
    if (existing) { existing.last = item.visited_at; existing.count++; }
    else aggregated.set(item.domain, { first: item.visited_at, last: item.visited_at, count: 1 });
  }

  const result = Array.from(aggregated.entries()).map(([domain, data]) => ({
    domain, first_seen_at: data.first, last_seen_at: data.last, hits: data.count,
  }));

  return { success: true, agent_id: agentId, agent_name: agent.agent_name, items: result };
}

// ── get-agent-dashboard-data ───────────────────────────────────────────
const OFFLINE_THRESHOLD_MINUTES = 30;

export async function handleGetAgentDashboardData(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { __status: 400, error: 'Tenant required' };

  const { data: agentsWithMetrics, error: metricsError } = await supabase
    .rpc('get_latest_agent_metrics', { p_tenant_id: tenantId });

  if (metricsError) {
    logger.error(`[${requestId}] Metrics error:`, metricsError);
    return { __status: 500, error: 'Failed to fetch metrics' };
  }

  const now = new Date();
  const agents = (agentsWithMetrics || []).map((agent: Record<string, unknown>) => {
    const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat as string) : null;
    const minutesSinceHeartbeat = lastHeartbeat
      ? (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60) : Infinity;
    const isOnline = minutesSinceHeartbeat <= OFFLINE_THRESHOLD_MINUTES;
    return { ...agent, is_online: isOnline, minutes_since_heartbeat: Math.round(minutesSinceHeartbeat) };
  });

  const onlineCount = agents.filter((a: Record<string, unknown>) => a.is_online).length;
  const offlineCount = agents.length - onlineCount;

  return {
    success: true, agents, summary: { total: agents.length, online: onlineCount, offline: offlineCount },
  };
}
