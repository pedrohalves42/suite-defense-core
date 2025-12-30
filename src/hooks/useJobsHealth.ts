import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface JobMetricsByType {
  tenant_id: string;
  type: string;
  total_jobs: number;
  completed: number;
  failed: number;
  queued: number;
  delivered: number;
  stuck: number;
  avg_execution_seconds: number | null;
  success_rate_pct: number | null;
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

export const useJobsHealth = () => {
  const { activeTenant } = useActiveTenant();
  const tenantId = activeTenant?.id;

  const metricsQuery = useQuery({
    queryKey: ['job-metrics-by-type', tenantId],
    queryFn: async (): Promise<JobMetricsByType[]> => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('v_job_metrics_by_type')
        .select('*')
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
      return (data || []) as JobMetricsByType[];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const trendsQuery = useQuery({
    queryKey: ['job-hourly-trends', tenantId],
    queryFn: async (): Promise<JobHourlyTrend[]> => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('v_job_hourly_trends')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('hour', { ascending: true });
      
      if (error) throw error;
      return (data || []) as JobHourlyTrend[];
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const stuckJobsQuery = useQuery({
    queryKey: ['stuck-jobs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('jobs')
        .select('id, type, agent_name, status, created_at, delivered_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'delivered')
        .lt('delivered_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('delivered_at', { ascending: true })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // Calculate summary from metrics
  const summary: JobsHealthSummary = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    queuedJobs: 0,
    executingJobs: 0,
    stuckJobs: 0,
    overallSuccessRate: 0,
    avgExecutionSeconds: 0,
  };

  if (metricsQuery.data) {
    let totalExecTime = 0;
    let execTimeCount = 0;

    metricsQuery.data.forEach((m) => {
      summary.totalJobs += m.total_jobs;
      summary.completedJobs += m.completed;
      summary.failedJobs += m.failed;
      summary.queuedJobs += m.queued;
      summary.executingJobs += m.delivered;
      summary.stuckJobs += m.stuck;
      
      if (m.avg_execution_seconds) {
        totalExecTime += m.avg_execution_seconds * m.completed;
        execTimeCount += m.completed;
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
