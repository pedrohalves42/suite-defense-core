import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { subDays } from 'date-fns';

interface MetricDataPoint {
  collected_at: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
}

/**
 * Hook to fetch agent metrics history for the active tenant
 * ADR-029 CRIT-04: Refactored to use useActiveTenant with loading guard
 */
export function useAgentMetricsHistory(daysBack: number = 7) {
  const { activeTenant, loading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['agent-metrics-history', activeTenant?.id, daysBack],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      const startDate = subDays(new Date(), daysBack).toISOString();
      
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select(`
          collected_at,
          cpu_usage_percent,
          memory_usage_percent,
          disk_usage_percent
        `)
        .eq('tenant_id', activeTenant.id)
        .gte('collected_at', startDate)
        .order('collected_at', { ascending: true });
      
      if (error) throw error;
      return data as MetricDataPoint[];
    },
    enabled: !loading && !!activeTenant?.id,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: 300000,
    refetchIntervalInBackground: false, // COST-OPT: 60s → 5min
  });
}
