import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentSyncStatus {
  id: string;
  agent_name: string;
  display_name: string | null;
  status: string;
  last_heartbeat: string | null;
  last_block_sync_at: string | null;
  syncStatus: 'synced' | 'pending' | 'offline' | 'never';
}

export function useAgentSyncStatus() {
  const { data: agents, isLoading, error, refetch } = useQuery({
    queryKey: ['agent-sync-status'],
    queryFn: async (): Promise<AgentSyncStatus[]> => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, display_name, status, last_heartbeat, last_block_sync_at, archived_at')
        .eq('status', 'active')
        .is('archived_at', null)
        .order('agent_name');

      if (error) {
        console.error('[useAgentSyncStatus] Error fetching agents:', error);
        throw error;
      }

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      return (data || []).map((agent: any) => {
        const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
        const lastBlockSync = agent.last_block_sync_at ? new Date(agent.last_block_sync_at) : null;

        let syncStatus: AgentSyncStatus['syncStatus'] = 'never';

        if (!lastHeartbeat || lastHeartbeat < fiveMinutesAgo) {
          syncStatus = 'offline';
        } else if (!lastBlockSync) {
          syncStatus = 'never';
        } else if (lastBlockSync >= oneDayAgo) {
          syncStatus = 'synced';
        } else {
          syncStatus = 'pending';
        }

        return {
          ...agent,
          syncStatus,
        };
      });
    },
    staleTime: 30 * 1000,
  });

  const stats = {
    total: agents?.length || 0,
    synced: agents?.filter(a => a.syncStatus === 'synced').length || 0,
    pending: agents?.filter(a => a.syncStatus === 'pending' || a.syncStatus === 'never').length || 0,
    offline: agents?.filter(a => a.syncStatus === 'offline').length || 0,
  };

  return {
    agents: agents || [],
    isLoading,
    error,
    refetch,
    stats,
  };
}
