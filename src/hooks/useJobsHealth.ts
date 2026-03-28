import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { tenantQuery } from '@/lib/tenantQuery';

export interface AgentOperationalInfo {
  id: string;
  agent_name: string;
  status: string;
  scheduling_paused: boolean;
  scheduling_paused_reason: string | null;
  agent_version: string | null;
  last_heartbeat: string | null;
}

export interface FailureBreakdown {
  category: string;
  count: number;
  label: string;
}

// Interface aligned with v_job_metrics_by_type view (ADR-026)
export interface JobMetricsByType {
  tenant_id: string;
  type: string;
  total_count: number;
  completed_count: number;
  failed_count: number;
  avg_duration_seconds: number | null;
}

export interface JobHourlyTrend {
  tenant_id: string;
  hour: string;
  total: number;
  completed: number;
  failed: number;
  success_rate_pct: number | null;
}

export interface JobsHealthSummary {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  queuedJobs: number;
  executingJobs: number;
  stuckJobs: number;
  overallSuccessRate: number;
  avgExecutionSeconds: number;
}

/**
 * ADR-029 CRIT-04: Added loading guard to prevent race conditions
 */
export const useJobsHealth = () => {
  const { activeTenant, loading } = useActiveTenant();  // ADR-029 CRIT-04: Add loading
  const tenantId = activeTenant?.id;

  const metricsQuery = useQuery({
    queryKey: ['job-metrics-by-type', tenantId],
    queryFn: async (): Promise<JobMetricsByType[]> => {
      if (!tenantId) return [];
      
      // v_job_metrics_by_type is a view - use supabase.from() directly with tenant filter
      const { data, error } = await supabase
        .from('v_job_metrics_by_type')
        .select('type, tenant_id, total_count, completed_count, failed_count, avg_duration_seconds')
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
      return (data || []).map(row => ({
        tenant_id: row.tenant_id,
        type: row.type,
        total_count: Number(row.total_count) || 0,
        completed_count: Number(row.completed_count) || 0,
        failed_count: Number(row.failed_count) || 0,
        avg_duration_seconds: row.avg_duration_seconds ? Number(row.avg_duration_seconds) : null,
      }));
    },
    enabled: !loading && !!tenantId,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: 300000, // COST-OPT: 30s → 5min
    staleTime: 10000,
  });

  const trendsQuery = useQuery({
    queryKey: ['job-hourly-trends', tenantId],
    queryFn: async (): Promise<JobHourlyTrend[]> => {
      if (!tenantId) return [];
      
      // v_job_hourly_trends is a view - use supabase.from() directly with tenant filter
      const { data, error } = await supabase
        .from('v_job_hourly_trends')
        .select('hour, tenant_id, total, completed, failed, success_rate_pct')
        .eq('tenant_id', tenantId)
        .order('hour', { ascending: true });
      
      if (error) throw error;
      return (data || []) as JobHourlyTrend[];
    },
    enabled: !loading && !!tenantId,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: 300000, // COST-OPT: 60s → 5min
    staleTime: 30000,
  });

  const stuckJobsQuery = useQuery({
    queryKey: ['stuck-jobs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await tenantQuery('jobs', tenantId)
        .select('id, type, agent_name, status, created_at, delivered_at')
        .eq('status', 'delivered')
        .lt('delivered_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('delivered_at', { ascending: true })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !loading && !!tenantId,
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });

  // Operational: paused agents & outdated versions
  const agentOpsQuery = useQuery({
    queryKey: ['agent-ops-info', tenantId],
    queryFn: async (): Promise<AgentOperationalInfo[]> => {
      if (!tenantId) return [];
      
      const { data, error } = await tenantQuery('agents', tenantId)
        .select('id, agent_name, status, scheduling_paused, scheduling_paused_reason, agent_version, last_heartbeat');
      
      if (error) throw error;
      return (data || []) as AgentOperationalInfo[];
    },
    enabled: !loading && !!tenantId,
    refetchInterval: 300000, // COST-OPT: 60s → 5min
    staleTime: 30000,
  });

  // Failure breakdown by error category (last 7 days)
  const failureBreakdownQuery = useQuery({
    queryKey: ['failure-breakdown', tenantId],
    queryFn: async (): Promise<FailureBreakdown[]> => {
      if (!tenantId) return [];
      
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await tenantQuery('jobs', tenantId)
        .select('error_message')
        .eq('status', 'failed')
        .gte('created_at', sevenDaysAgo)
        .limit(1000);
      
      if (error) throw error;
      
      // Categorize failures
      const categories: Record<string, number> = {};
      (data || []).forEach((job: Record<string, unknown>) => {
        const msg = (job.error_message || '').toLowerCase();
        let cat = 'other';
        if (msg.includes('agent_offline') || msg.includes('auto_cancelled')) cat = 'agent_offline';
        else if (msg.includes('ttl') || msg.includes('expired') || msg.includes('expirado')) cat = 'ttl_exceeded';
        else if (msg.includes('zombie') || msg.includes('stuck') || msg.includes('stalled')) cat = 'zombie_stalled';
        else if (msg.includes('unknown job type') || msg.includes('handler')) cat = 'unknown_handler';
        else if (msg.includes('timeout')) cat = 'timeout';
        
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const labels: Record<string, string> = {
        agent_offline: 'Agente Offline/Inativo',
        ttl_exceeded: 'TTL Expirado',
        zombie_stalled: 'Zombie/Travado',
        unknown_handler: 'Handler Desconhecido',
        timeout: 'Timeout',
        other: 'Outros',
      };

      return Object.entries(categories)
        .map(([cat, count]) => ({ category: cat, count, label: labels[cat] || cat }))
        .sort((a, b) => b.count - a.count);
    },
    enabled: !loading && !!tenantId,
    refetchInterval: 300_000, // COST-OPT v8: 2min → 5min
    staleTime: 120_000,
    refetchIntervalInBackground: false,
  });

  // Compute operational metrics
  const agents = agentOpsQuery.data || [];
  const pausedAgents = agents.filter(a => a.scheduling_paused);
  const latestVersion = agents.reduce((max, a) => {
    if (!a.agent_version) return max;
    return a.agent_version > max ? a.agent_version : max;
  }, '');
  const outdatedAgents = latestVersion 
    ? agents.filter(a => a.status === 'active' && a.agent_version && a.agent_version < latestVersion)
    : [];

  // Calculate summary from metrics
  const summary: JobsHealthSummary = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    queuedJobs: 0,
    executingJobs: 0,
    stuckJobs: stuckJobsQuery.data?.length || 0,
    overallSuccessRate: 0,
    avgExecutionSeconds: 0,
  };

  if (metricsQuery.data) {
    let totalExecTime = 0;
    let execTimeCount = 0;

    metricsQuery.data.forEach((m) => {
      summary.totalJobs += m.total_count;
      summary.completedJobs += m.completed_count;
      summary.failedJobs += m.failed_count;
      
      if (m.avg_duration_seconds !== null) {
        totalExecTime += m.avg_duration_seconds * m.completed_count;
        execTimeCount += m.completed_count;
      }
    });

    summary.overallSuccessRate = summary.totalJobs > 0 
      ? Math.round((summary.completedJobs / summary.totalJobs) * 1000) / 10
      : 0;
    
    summary.avgExecutionSeconds = execTimeCount > 0
      ? Math.round((totalExecTime / execTimeCount) * 10) / 10
      : 0;
  }

  return {
    metrics: metricsQuery.data || [],
    trends: trendsQuery.data || [],
    stuckJobs: stuckJobsQuery.data || [],
    summary,
    pausedAgents,
    outdatedAgents,
    failureBreakdown: failureBreakdownQuery.data || [],
    isLoading: metricsQuery.isLoading || trendsQuery.isLoading,
    isError: metricsQuery.isError || trendsQuery.isError,
    refetch: () => {
      metricsQuery.refetch();
      trendsQuery.refetch();
      stuckJobsQuery.refetch();
      agentOpsQuery.refetch();
      failureBreakdownQuery.refetch();
    },
  };
};
