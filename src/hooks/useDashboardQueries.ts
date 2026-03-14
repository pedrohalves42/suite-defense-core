import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTenant } from "@/hooks/useTenant";
import { useEffect } from "react";
import { logger } from "@/lib/logger";
import type {
  DashboardAgent, DashboardJob, DashboardReport,
  DashboardAgentToken, DashboardRateLimit, DashboardVirusScan, DashboardAuditLog,
} from "@/types/dashboard";

const REFETCH_INTERVAL = 10_000;
const STALE_TIME = 5_000;

async function fetchAgents(tenantId: string): Promise<DashboardAgent[]> {
  const { data, error } = await supabase.rpc('get_agents_list', {
    p_tenant_id: tenantId, p_include_archived: false,
  });
  if (error) throw error;
  return ((data || []) as any[]).map(a => ({
    id: a.id, agent_name: a.agent_name, status: a.status,
    enrolled_at: a.enrolled_at, last_heartbeat: a.last_heartbeat, tenant_id: a.tenant_id,
  }));
}

async function fetchJobs(tenantId: string): Promise<DashboardJob[]> {
  // V-6005: Slim select for jobs — avoid payload column
  const { data, error } = await supabase.from("jobs").select("id, agent_id, agent_name, tenant_id, type, status, priority, created_at, started_at, completed_at, expires_at, error_message")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

// P-13003 FIX: Slim select for reports — avoid fetching full report content
async function fetchReports(tenantId: string): Promise<DashboardReport[]> {
  const { data, error } = await supabase.from("reports")
    .select("id, tenant_id, title, report_type, status, created_at, updated_at")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

// P-13004 FIX: Slim select for tokens — avoid fetching sensitive fields
async function fetchTokens(tenantId: string): Promise<DashboardAgentToken[]> {
  const { data, error } = await supabase.from("agent_tokens" as any)
    .select("id, tenant_id, agent_id, is_active, created_at, expires_at, last_used_at")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as DashboardAgentToken[];
}

async function fetchRateLimits(tenantId: string): Promise<DashboardRateLimit[]> {
  const { data, error } = await (supabase.from("rate_limits") as any).select("*")
    .eq("tenant_id", tenantId).order("last_request_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

async function fetchVirusScans(tenantId: string): Promise<DashboardVirusScan[]> {
  const { data, error } = await supabase.from("virus_scans").select("*")
    .eq("tenant_id", tenantId).order("scanned_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

async function fetchAuditLogs(tenantId: string): Promise<DashboardAuditLog[]> {
  const { data, error } = await supabase.from("audit_logs")
    .select("id, action, resource_type, created_at, success, user_id")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

async function fetchTenantNames(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('tenants').select('id, name');
  if (error) return {};
  const map: Record<string, string> = {};
  (data || []).forEach(t => { map[t.id] = t.name; });
  return map;
}

/**
 * React Query-based dashboard data hook.
 * Replaces manual useState + setInterval + realtime channels with:
 * - Automatic caching and deduplication
 * - refetchInterval for polling
 * - Realtime channel invalidation
 */
export function useDashboardQueries() {
  const { isOnline } = useOnlineStatus();
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;
  const enabled = !!tenantId && isOnline;

  const agents = useQuery({
    queryKey: ["dashboard", "agents", tenantId],
    queryFn: () => fetchAgents(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: REFETCH_INTERVAL,
  });

  const jobs = useQuery({
    queryKey: ["dashboard", "jobs", tenantId],
    queryFn: () => fetchJobs(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: REFETCH_INTERVAL,
  });

  const reports = useQuery({
    queryKey: ["dashboard", "reports", tenantId],
    queryFn: () => fetchReports(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: REFETCH_INTERVAL,
  });

  const agentTokens = useQuery({
    queryKey: ["dashboard", "tokens", tenantId],
    queryFn: () => fetchTokens(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: 30_000,
  });

  const rateLimits = useQuery({
    queryKey: ["dashboard", "rateLimits", tenantId],
    queryFn: () => fetchRateLimits(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: 30_000,
  });

  const virusScans = useQuery({
    queryKey: ["dashboard", "virusScans", tenantId],
    queryFn: () => fetchVirusScans(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: REFETCH_INTERVAL,
  });

  const auditLogs = useQuery({
    queryKey: ["dashboard", "auditLogs", tenantId],
    queryFn: () => fetchAuditLogs(tenantId!),
    enabled, staleTime: STALE_TIME, refetchInterval: 30_000,
  });

  const tenantNames = useQuery({
    queryKey: ["dashboard", "tenantNames"],
    queryFn: fetchTenantNames,
    staleTime: 5 * 60 * 1000,
  });

  // Realtime invalidation (instead of full refetch)
  useEffect(() => {
    if (!tenantId) return;

    const agentsChannel = supabase
      .channel(`rq-agents-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'agents',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        logger.info('[DashboardQueries] Agents changed, invalidating...');
        queryClient.invalidateQueries({ queryKey: ["dashboard", "agents", tenantId] });
      })
      .subscribe();

    const jobsChannel = supabase
      .channel(`rq-jobs-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'jobs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        logger.info('[DashboardQueries] Jobs changed, invalidating...');
        queryClient.invalidateQueries({ queryKey: ["dashboard", "jobs", tenantId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [tenantId, queryClient]);

  const loading = agents.isLoading || jobs.isLoading || reports.isLoading;

  return {
    agents: agents.data || [],
    jobs: jobs.data || [],
    reports: reports.data || [],
    agentTokens: agentTokens.data || [],
    rateLimits: rateLimits.data || [],
    virusScans: virusScans.data || [],
    auditLogs: auditLogs.data || [],
    loading,
    tenant,
    tenantLoading,
    tenantNames: tenantNames.data || {},
    refresh: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  };
}
