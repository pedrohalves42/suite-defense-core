import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface StuckJob {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  tenant_id: string;
  created_at: string;
  delivered_at: string | null;
  minutes_stuck: number;
  stuck_reason: string;
}

export interface EdgeFunctionStat {
  function_name: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  first_call: string;
  last_call: string;
}

export interface OperationsSummary {
  tenant_id: string;
  tenant_name: string;
  total_agents: number;
  online_agents: number;
  offline_agents: number;
  jobs_24h: number;
  jobs_completed_24h: number;
  jobs_failed_24h: number;
  open_alerts: number;
}

const QUERY_OPTIONS = { refetchInterval: false, staleTime: 600_000, refetchOnWindowFocus: false } as const;

export function useSystemOperations() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['system-operations-summary', tenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase)
        .from('v_system_operations_summary')
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as OperationsSummary;
    },
    enabled: !!tenant?.id,
    ...QUERY_OPTIONS,
  });

  const { data: stuckJobs = [], isLoading: loadingStuck } = useQuery({
    queryKey: ['stuck-jobs-report', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_stuck_jobs_report')
        .select('*')
        .order('minutes_stuck', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as StuckJob[];
    },
    enabled: !!tenant?.id,
    ...QUERY_OPTIONS,
  });

  const { data: efStats = [], isLoading: loadingEF } = useQuery({
    queryKey: ['edge-function-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_edge_function_stats')
        .select('*')
        .order('total_calls', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as EdgeFunctionStat[];
    },
    ...QUERY_OPTIONS,
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-router', {
        body: { action: 'stuck-jobs', tenant_id: tenant?.id }
      });
      if (error) throw error;
      return data;
    },
    onMutate: () => { toast.loading('Limpando jobs travados...', { id: 'cleanup-stuck' }); },
    onSuccess: (data) => {
      toast.success(`${data?.cleaned_count || 0} jobs travados limpos`, { id: 'cleanup-stuck' });
      queryClient.invalidateQueries({ queryKey: ['stuck-jobs-report'] });
      queryClient.invalidateQueries({ queryKey: ['system-operations-summary'] });
    },
    onError: (error) => {
      toast.error('Erro ao limpar jobs travados', { id: 'cleanup-stuck', description: error.message });
      logger.error('Cleanup stuck jobs failed', error);
    }
  });

  const runCleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_old_data_scheduled');
      if (error) throw error;
      return data;
    },
    onMutate: () => { toast.loading('Executando limpeza do sistema...', { id: 'run-cleanup' }); },
    onSuccess: (data) => {
      const result = data as Record<string, number | string>;
      toast.success('Limpeza executada com sucesso', {
        id: 'run-cleanup',
        description: `HMAC: ${result.hmac_deleted || 0}, Rate Limits: ${result.rate_limits_deleted || 0}, Logins: ${result.failed_logins_deleted || 0}`
      });
      queryClient.invalidateQueries({ queryKey: ['system-operations-summary'] });
    },
    onError: (error) => {
      toast.error('Erro na limpeza', { id: 'run-cleanup', description: error.message });
      logger.error('System cleanup failed', error);
    }
  });

  const handleRefresh = () => {
    toast.loading('Atualizando dados...', { id: 'refresh-ops' });
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['system-operations-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['stuck-jobs-report'] }),
      queryClient.invalidateQueries({ queryKey: ['edge-function-stats'] }),
    ]).then(() => { toast.success('Dados atualizados', { id: 'refresh-ops' }); });
  };

  const isLoading = loadingSummary || loadingStuck || loadingEF;

  const jobSuccessRate = summary && summary.jobs_24h > 0
    ? Math.round((summary.jobs_completed_24h / summary.jobs_24h) * 100)
    : 100;

  return {
    summary, stuckJobs, efStats, isLoading, jobSuccessRate,
    cleanupMutation, runCleanupMutation, handleRefresh,
  };
}
