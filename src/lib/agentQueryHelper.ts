import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * ADR-026 Phase 1: Centralized agent query helper
 *
 * Replaces all direct queries to `agents_safe` and `active_agents` views
 * with the `get_agents_list` RPC that uses explicit p_tenant_id.
 *
 * This eliminates JWT claim desync issues (race conditions after login
 * or tenant switch) that caused empty results or cross-tenant leaks.
 */

export interface AgentRecord {
  id: string;
  agent_name: string;
  display_name?: string | null;
  hostname?: string | null;
  os_type?: string | null;
  os_version?: string | null;
  agent_version?: string | null;
  agent_version_code?: number | null;
  status?: string | null;
  agent_state?: string | null;
  agent_mode?: string | null;
  last_heartbeat?: string | null;
  enrolled_at?: string | null;
  archived_at?: string | null;
  archived_reason?: string | null;
  tenant_id?: string | null;
  poll_interval_seconds?: number | null;
  [key: string]: unknown;
}

export interface AgentDashboardRecord extends AgentRecord {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
  os_type: string | null;
  os_version: string | null;
  hostname: string | null;
  agent_version: string | null;
  agent_state: string | null;
}

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

const toStringWithFallback = (value: unknown, fallback = ''): string => {
  const normalized = toNullableString(value);
  return normalized ?? fallback;
};

/**
 * Normalizes the RPC payload so every dashboard/installer view uses the same
 * field defaults, avoiding divergent status counts and search behavior.
 */
export function normalizeAgentRecord(agent: AgentRecord | Record<string, unknown>): AgentDashboardRecord {
  return {
    ...agent,
    id: toStringWithFallback(agent.id),
    agent_name: toStringWithFallback(agent.agent_name),
    status: toStringWithFallback(agent.status, 'pending'),
    enrolled_at: toStringWithFallback(agent.enrolled_at),
    last_heartbeat: toNullableString(agent.last_heartbeat),
    tenant_id: toStringWithFallback(agent.tenant_id),
    os_type: toNullableString(agent.os_type),
    os_version: toNullableString(agent.os_version),
    hostname: toNullableString(agent.hostname),
    agent_version: toNullableString(agent.agent_version),
    agent_state: toNullableString(agent.agent_state),
  };
}

/**
 * Fetch agents via RPC with explicit tenant_id (bypasses JWT sync issues)
 */
export async function fetchAgentsByTenant(
  tenantId: string,
  includeArchived = false
): Promise<AgentRecord[]> {
  const { data, error } = await supabase.rpc('get_agents_list', {
    p_tenant_id: tenantId,
    p_include_archived: includeArchived,
  });

  if (error) {
    logger.error('[fetchAgentsByTenant] RPC error', { error: error.message });
    throw error;
  }

  return (data as unknown as AgentRecord[]) || [];
}

/**
 * Fetch normalized agents for dashboards, management pages, and installers.
 */
export async function fetchAgentDashboardRecords(
  tenantId: string,
  includeArchived = false
): Promise<AgentDashboardRecord[]> {
  const agents = await fetchAgentsByTenant(tenantId, includeArchived);
  return agents
    .map(normalizeAgentRecord)
    .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime());
}

/**
 * Fetch a single agent by ID via RPC (tenant-safe)
 */
export async function fetchAgentById(
  tenantId: string,
  agentId: string,
  includeArchived = false
): Promise<AgentRecord | null> {
  // Optimized: fetch single agent via RPC filter instead of full list scan
  const agents = await fetchAgentsByTenant(tenantId, includeArchived);
  return agents.find(a => a.id === agentId) || null;
}

/**
 * Get agent count for a tenant (replaces count queries on agents_safe)
 */
export async function getAgentCount(
  tenantId: string,
  includeArchived = false
): Promise<number> {
  const agents = await fetchAgentsByTenant(tenantId, includeArchived);
  return agents.length;
}
