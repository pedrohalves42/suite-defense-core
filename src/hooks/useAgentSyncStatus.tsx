import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';

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
  const { tenant } = useTenant();
  
  const { data: agents, isLoading, error, refetch } = useQuery({
    queryKey: ['agent-sync-status', tenant?.id],
    queryFn: async (): Promise<AgentSyncStatus[]> => {
      if (!tenant?.id) return [];
      
      // ADR-026: Use get_agents_list RPC with explicit tenant_id to avoid JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });

      if (error) {
        console.error('[useAgentSyncStatus] Error fetching agents:', error);
        throw error;
      }

      const now = new Date();
      const offlineThreshold = new Date(now.getTime() - AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // RPC returns jsonb objects, map to expected interface
      return (data || []).map((agent: any) => {
        const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
        const lastBlockSync = agent.last_block_sync_at ? new Date(agent.last_block_sync_at) : null;

        let syncStatus: AgentSyncStatus['syncStatus'] = 'never';

        if (!lastHeartbeat || lastHeartbeat < offlineThreshold) {
          syncStatus = 'offline';
        } else if (!lastBlockSync) {
          syncStatus = 'never';
        } else if (lastBlockSync >= oneDayAgo) {
          syncStatus = 'synced';
        } else {
          syncStatus = 'pending';
        }

        return {
          id: agent.id,
          agent_name: agent.agent_name,
          display_name: agent.display_name,
          status: agent.status,
          last_heartbeat: agent.last_heartbeat,
          last_block_sync_at: agent.last_block_sync_at,
          syncStatus,
        };
      });
    },
    enabled: !!tenant?.id,
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
