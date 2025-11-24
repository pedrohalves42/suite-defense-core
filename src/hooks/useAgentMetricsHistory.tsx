import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';

interface MetricDataPoint {
  collected_at: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
}

export function useAgentMetricsHistory(tenantId: string | undefined, daysBack: number = 7) {
  return useQuery({
    queryKey: ['agent-metrics-history', tenantId, daysBack],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const startDate = subDays(new Date(), daysBack).toISOString();
      
      const { data, error } = await supabase
        .from('agent_system_metrics')
        .select(`
          collected_at,
          cpu_usage_percent,
          memory_usage_percent,
          disk_usage_percent
        `)
        .eq('tenant_id', tenantId)
        .gte('collected_at', startDate)
        .order('collected_at', { ascending: true });
      
      if (error) throw error;
      return data as MetricDataPoint[];
    },
    enabled: !!tenantId,
    refetchInterval: 60000, // Atualizar a cada 1 minuto
  });
}
