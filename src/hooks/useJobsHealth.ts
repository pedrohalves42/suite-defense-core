import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { tenantQuery } from '@/lib/tenantQuery';

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
      
      const { data, error } = await tenantQuery('v_job_metrics_by_type', tenantId)
        .select('*');
      
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
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const trendsQuery = useQuery({
    queryKey: ['job-hourly-trends', tenantId],
    queryFn: async (): Promise<JobHourlyTrend[]> => {
      if (!tenantId) return [];
      
      const { data, error } = await tenantQuery('v_job_hourly_trends', tenantId)
        .select('*')
        .order('hour', { ascending: true });
      
      if (error) throw error;
      return (data || []) as JobHourlyTrend[];
    },
    enabled: !loading && !!tenantId,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: 60000,
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
    enabled: !loading && !!tenantId,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: 30000,
  });

  // Calculate summary from metrics (ADR-026 aligned with new view columns)
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
    isLoading: metricsQuery.isLoading || trendsQuery.isLoading,
    isError: metricsQuery.isError || trendsQuery.isError,
    refetch: () => {
      metricsQuery.refetch();
      trendsQuery.refetch();
      stuckJobsQuery.refetch();
    },
  };
};
