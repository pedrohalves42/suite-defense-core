import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from './useTenant';

export interface ScheduledJobRun {
  id: string;
  job_key: string;
  job_source: string;
  ran_at: string;
  duration_ms: number | null;
  success: boolean;
  error: string | null;
  result: Record<string, unknown> | null;
  processed_count: number;
  tenant_id: string | null;
  created_at: string;
}

export interface JobHealthStatus {
  job_key: string;
  job_source: string;
  last_run: string | null;
  last_success: string | null;
  last_failure: string | null;
  failure_count_24h: number;
  success_count_24h: number;
  total_runs_24h: number;
  avg_duration_ms: number | null;
  max_duration_ms: number | null;
  health_status: 'healthy' | 'warning' | 'critical' | 'stale' | 'never_ran';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ScheduledJobsHealthSummary {
  total_jobs: number;
  healthy_jobs: number;
  warning_jobs: number;
  critical_jobs: number;
  stale_jobs: number;
  never_ran_jobs: number;
}

export function useScheduledJobsHealth() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  // V-9001 FIX: Add tenantId to all queryKeys to prevent cross-tenant cache pollution
  // Fetch job health from view
  const healthQuery = useQuery({
    queryKey: ['scheduled-jobs-health', tenant?.id],
    queryFn: async (): Promise<JobHealthStatus[]> => {
      const { data, error } = await supabase
        .from('v_job_health')
        .select('job_key, job_source, last_run, last_success, last_failure, failure_count_24h, success_count_24h, total_runs_24h, avg_duration_ms, max_duration_ms, health_status, severity')
        .order('job_key');

      if (error) throw error;
      return (data || []) as unknown as JobHealthStatus[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    staleTime: 30000,
  });

  // Fetch recent job runs
  const recentRunsQuery = useQuery({
    queryKey: ['scheduled-job-runs', tenant?.id],
    queryFn: async (): Promise<ScheduledJobRun[]> => {
      const { data, error } = await supabase
        .from('scheduled_job_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as ScheduledJobRun[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
    staleTime: 10000,
  });

  // Fetch health summary
  const summaryQuery = useQuery({
    queryKey: ['scheduled-jobs-health-summary', tenant?.id],
    queryFn: async (): Promise<ScheduledJobsHealthSummary> => {
      const { data, error } = await supabase.rpc('get_job_health_summary');

      if (error) throw error;
      
      const result = data as unknown as ScheduledJobsHealthSummary;
      return result || {
        total_jobs: 0,
        healthy_jobs: 0,
        warning_jobs: 0,
        critical_jobs: 0,
        stale_jobs: 0,
        never_ran_jobs: 0,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    staleTime: 30000,
  });

  // Trigger health monitor manually
  const triggerMonitor = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('job-health-monitor');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Monitor executado: ${data.jobs_checked} jobs verificados, ${data.alerts_created} alertas criados`);
      queryClient.invalidateQueries({ queryKey: ['scheduled-jobs-health'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-job-runs'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-jobs-health-summary'] });
    },
    onError: (error) => {
      toast.error('Erro ao executar monitor: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });

  // Calculate derived stats
  const stats = {
    healthyPercentage: summaryQuery.data?.total_jobs 
      ? Math.round((summaryQuery.data.healthy_jobs / summaryQuery.data.total_jobs) * 100)
      : 0,
    hasIssues: (summaryQuery.data?.critical_jobs || 0) > 0 || (summaryQuery.data?.warning_jobs || 0) > 0,
    criticalJobs: healthQuery.data?.filter(j => j.severity === 'critical') || [],
    warningJobs: healthQuery.data?.filter(j => j.severity === 'high') || [],
  };

  return {
    health: healthQuery.data || [],
    recentRuns: recentRunsQuery.data || [],
    summary: summaryQuery.data || {
      total_jobs: 0,
      healthy_jobs: 0,
      warning_jobs: 0,
      critical_jobs: 0,
      stale_jobs: 0,
      never_ran_jobs: 0,
    },
    stats,
    isLoading: healthQuery.isLoading || summaryQuery.isLoading,
    isError: healthQuery.isError || summaryQuery.isError,
    triggerMonitor,
    refetch: () => {
      healthQuery.refetch();
      recentRunsQuery.refetch();
      summaryQuery.refetch();
    },
  };
}
