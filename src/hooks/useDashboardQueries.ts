import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { logger } from "@/lib/logger";
import type {
  DashboardAgent, DashboardJob, DashboardReport,
  DashboardAgentToken, DashboardRateLimit, DashboardVirusScan, DashboardAuditLog,
} from "@/types/dashboard";

// PERF-FIX: Increase polling intervals to reduce DB pressure (10s → 30s for primary, 5s → 15s stale)
// COST-OPT v8: 30s → 120s primary polling, 15s → 60s stale
const REFETCH_INTERVAL = 120_000;
const STALE_TIME = 60_000;

async function fetchAgents(tenantId: string): Promise<DashboardAgent[]> {
  const { data, error } = await supabase.rpc('get_agents_list', {
    p_tenant_id: tenantId, p_include_archived: false,
  });
  if (error) throw error;
  return ((data || []) as Array<Record<string, unknown>>).map(a => ({
    id: a.id as string, agent_name: a.agent_name as string, status: a.status as string,
    enrolled_at: a.enrolled_at as string, last_heartbeat: a.last_heartbeat as string, tenant_id: a.tenant_id as string,
  }));
}

async function fetchJobs(tenantId: string): Promise<DashboardJob[]> {
  // V-6005: Slim select for jobs — avoid payload column.
  // FIX: Expanded window to 48h so useDashboardMetrics can compute trends (24h vs prev 24h)
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("jobs").select("id, agent_id, agent_name, tenant_id, type, status, priority, created_at, started_at, completed_at, expires_at, error_message")
    .eq("tenant_id", tenantId).gte("created_at", fortyEightHoursAgo).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return data || [];
}

// P-13003 FIX: Slim select for reports — avoid fetching full content
async function fetchReports(tenantId: string): Promise<DashboardReport[]> {
  const { data, error } = await supabase.from("reports")
    .select("id, agent_name, kind, file_path, created_at")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

// P-13004 FIX: Slim select for tokens — avoid fetching sensitive fields
async function fetchTokens(tenantId: string): Promise<DashboardAgentToken[]> {
  const { data, error } = await supabase
    .from("agent_tokens")
    .select("id, tenant_id, agent_id, is_active, created_at, expires_at, last_used_at")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as DashboardAgentToken[];
}

// PERF-FIX: Slim select for rate_limits — avoid fetching metadata blobs
async function fetchRateLimits(tenantId: string): Promise<DashboardRateLimit[]> {
  const { data, error } = await supabase.from("rate_limits")
    .select("id, tenant_id, identifier, endpoint, request_count, last_request_at, blocked_until, window_start")
    .eq("tenant_id", tenantId).order("last_request_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []) as unknown as DashboardRateLimit[];
}

// PERF-FIX: Slim select for virus_scans — avoid fetching large scan_output blob
async function fetchVirusScans(tenantId: string): Promise<DashboardVirusScan[]> {
  const { data, error } = await supabase.from("virus_scans")
    .select("id, agent_name, tenant_id, file_path, file_hash, is_malicious, positives, total_scans, scanned_at")
    .eq("tenant_id", tenantId).order("scanned_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data as unknown as DashboardVirusScan[] || [];
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

  // Agents & Jobs use Realtime (tables already have publications)
  const agents = useRealtimeQuery<DashboardAgent[]>({
    queryKey: ["dashboard", "agents", tenantId],
    queryFn: () => fetchAgents(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    realtimeTable: 'agents',
    realtimeFilter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
  });

  const jobs = useRealtimeQuery<DashboardJob[]>({
    queryKey: ["dashboard", "jobs", tenantId],
    queryFn: () => fetchJobs(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    realtimeTable: 'jobs',
    realtimeFilter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
  });

  // Virus scans — no Realtime publication, use adaptive polling
  const virusScans = useQuery({
    queryKey: ["dashboard", "virusScans", tenantId],
    queryFn: () => fetchVirusScans(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  const reports = useQuery({
    queryKey: ["dashboard", "reports", tenantId],
    queryFn: () => fetchReports(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  const agentTokens = useQuery({
    queryKey: ["dashboard", "tokens", tenantId],
    queryFn: () => fetchTokens(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  const rateLimits = useQuery({
    queryKey: ["dashboard", "rateLimits", tenantId],
    queryFn: () => fetchRateLimits(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  const auditLogs = useQuery({
    queryKey: ["dashboard", "auditLogs", tenantId],
    queryFn: () => fetchAuditLogs(tenantId!),
    enabled,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  const tenantNames = useQuery({
    queryKey: ["dashboard", "tenantNames"],
    queryFn: fetchTenantNames,
    staleTime: 600_000,
  });

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

