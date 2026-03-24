import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DiskMetric } from '@/components/agent/AgentCard';

/**
 * Hook to fetch disk metrics for multiple agents at once
 */
export function useAgentsDiskMetrics(agentIds: string[]) {
  return useQuery({
    queryKey: ['agents-disk-metrics', agentIds.sort().join(',')],
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('agent_disk_metrics')
        .select('agent_id, drive_letter, usage_percent, total_gb, free_gb, is_system_drive, collected_at')
        .in('agent_id', agentIds)
        .order('collected_at', { ascending: false });
      
      if (error) throw error;
      
      // Group by agent_id and keep only latest metrics per drive
      const disksMap: Record<string, DiskMetric[]> = {};
      const seenDrives: Record<string, Set<string>> = {};
      
      for (const row of data || []) {
        if (!disksMap[row.agent_id]) {
          disksMap[row.agent_id] = [];
          seenDrives[row.agent_id] = new Set();
        }
        
        // Only add each drive once (the first one is the most recent due to ordering)
        if (!seenDrives[row.agent_id].has(row.drive_letter)) {
          seenDrives[row.agent_id].add(row.drive_letter);
          disksMap[row.agent_id].push({
            drive_letter: row.drive_letter,
            usage_percent: row.usage_percent,
            total_gb: row.total_gb,
            free_gb: row.free_gb,
            is_system_drive: row.is_system_drive,
          });
        }
      }
      
      // Sort drives alphabetically for each agent
      for (const agentId of Object.keys(disksMap)) {
        disksMap[agentId].sort((a, b) => a.drive_letter.localeCompare(b.drive_letter));
      }
      
      return disksMap;
    },
    enabled: agentIds.length > 0,
    staleTime: 30000,
    refetchInterval: 300000,
    refetchIntervalInBackground: false, // COST-OPT: 60s → 5min
  });
}
