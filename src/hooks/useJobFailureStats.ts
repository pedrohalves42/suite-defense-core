import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface JobFailureStat {
  job_type: string;
  agent_name: string | null;
  agent_id: string | null;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  failure_rate: number;
}

export function useJobFailureStats(groupByAgent = false, daysBack = 30) {
  const { activeTenant } = useActiveTenant();

  return useQuery({
    queryKey: ['job-failure-stats', activeTenant?.id, groupByAgent, daysBack],
    queryFn: async (): Promise<JobFailureStat[]> => {
      if (!activeTenant?.id) return [];
      const { data, error } = await supabase.rpc('get_job_failure_stats', {
        p_tenant_id: activeTenant.id,
        p_days_back: daysBack,
        p_group_by_agent: groupByAgent,
      });
      if (error) throw error;
      return (data || []) as unknown as JobFailureStat[];
    },
    enabled: !!activeTenant?.id,
    staleTime: 5 * 60 * 1000,
  });
}
