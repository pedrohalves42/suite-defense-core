import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AgentSystemMetrics {
  agent_id: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
  uptime_seconds: number | null;
}

/**
 * Hook to fetch the latest system metrics for a single agent
 */
export function useAgentSystemMetrics(agentId: string | undefined) {
  return useQuery({
    queryKey: ['agent-system-metrics', agentId],
    queryFn: async () => {
      if (!agentId) return null;
      
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds')
        .eq('agent_id', agentId)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as AgentSystemMetrics | null;
    },
    enabled: !!agentId,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Hook to fetch the latest system metrics for multiple agents at once
 */
export function useAgentsSystemMetrics(agentIds: string[]) {
  return useQuery({
    queryKey: ['agents-system-metrics', agentIds.sort().join(',')],
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      
      // Get the latest metrics for each agent using a subquery approach
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds, collected_at')
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
            uptime_seconds: row.uptime_seconds,
          };
        }
      }
      
      return metricsMap;
    },
    enabled: agentIds.length > 0,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
