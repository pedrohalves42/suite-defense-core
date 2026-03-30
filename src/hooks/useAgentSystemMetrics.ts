import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from './useActiveTenant';


interface AgentSystemMetrics {
  agent_id: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
  uptime_seconds: number | null;
}

/**
 * Hook to fetch the latest system metrics for a single agent
 * P0 CRIT-02: Fixed race condition - waits for tenant sync before querying
 */
export function useAgentSystemMetrics(agentId: string | undefined) {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['agent-system-metrics', activeTenant?.id, agentId],
    queryFn: async () => {
      if (!agentId) return null;
      
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds')
        .eq('agent_id', agentId)
        .eq('tenant_id', activeTenant!.id) // P0 CRIT-02: Explicit tenant filter
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as AgentSystemMetrics | null;
    },
    enabled: !tenantLoading && !!activeTenant?.id && !!agentId, // P0 CRIT-02: Race condition fix
    staleTime: 300_000,
    refetchInterval: false,
    refetchOnWindowFocus: true
  });
}

/**
 * Hook to fetch the latest system metrics for multiple agents at once
 * P0 CRIT-02: Fixed race condition - waits for tenant sync before querying
 */
export function useAgentsSystemMetrics(agentIds: string[]) {
  
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['agents-system-metrics', activeTenant?.id, agentIds.sort().join(',')],
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      
      // Get the latest metrics for each agent using a subquery approach
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds, collected_at')
        .eq('tenant_id', activeTenant!.id) // P0 CRIT-02: Explicit tenant filter
        .in('agent_id', agentIds)
        .order('collected_at', { ascending: false });
      
      if (error) throw error;
      
      // Group by agent_id and take only the latest entry for each
      const metricsMap: Record<string, AgentSystemMetrics> = {};
      for (const row of data || []) {
        if (!metricsMap[row.agent_id]) {
          metricsMap[row.agent_id] = {
            agent_id: row.agent_id,
            cpu_usage_percent: row.cpu_usage_percent,
            memory_usage_percent: row.memory_usage_percent,
            disk_usage_percent: row.disk_usage_percent,
            uptime_seconds: row.uptime_seconds
          };
        }
      }
      
      return metricsMap;
    },
    enabled: !tenantLoading && !!activeTenant?.id && agentIds.length > 0, // P0 CRIT-02: Race condition fix
    staleTime: 30000,
    refetchInterval: adaptiveInterval
  });
}
