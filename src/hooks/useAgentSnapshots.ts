import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import type { AgentSnapshot } from './useAgentSnapshot';
import { logger } from '@/lib/logger';
import { getAgentOnlineStatus } from '@/lib/agent-status-constants';


/**
 * Hook para lista canônica de snapshots (todos os agentes do tenant)
 * 
 * Usa RPC get_agents_snapshots_list para garantir consistência
 * com useAgentSnapshot individual - ambos leem da mesma view.
 * 
 * Uso:
 * ```tsx
 * const { data: snapshots, isLoading } = useAgentSnapshots();
 * // snapshots é uma lista de AgentSnapshot[]
 * ```
 */
export function useAgentSnapshots() {
  
  const { tenant, loading: tenantLoading } = useTenant();

  return useQuery({
    queryKey: ['agent-snapshots-list', tenant?.id],
    queryFn: async (): Promise<AgentSnapshot[]> => {
      // Wave 4 - B40: defensive guard. `enabled` already blocks execution, but
      // a manual `refetch()` from a stale tenant context could still slip through.
      if (!tenant?.id) return [];

      const { data, error } = await supabase.rpc('get_agents_snapshots_list', {
        p_tenant_id: tenant.id,
      });

      if (error) {
        logger.error('[useAgentSnapshots] Error:', error);
        throw new Error(error.message || 'Failed to fetch agent snapshots list');
      }

      return (data || []) as unknown as AgentSnapshot[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 300_000,
    refetchInterval: false,
    refetchOnWindowFocus: true
  });
}

/**
 * Helper para obter contagem de status dos agentes
 */
export function getAgentStatusCounts(snapshots: AgentSnapshot[] | undefined) {
  if (!snapshots || snapshots.length === 0) {
    return {
      total: 0,
      online: 0,
      warning: 0,
      offline: 0,
      never_connected: 0
    };
  }

  return snapshots.reduce(
    (acc, snapshot) => {
      acc.total++;
      
      const status = getAgentOnlineStatus({
        last_heartbeat: snapshot.last_heartbeat,
        agent_state: snapshot.agent_state ?? undefined,
      });

      switch (status) {
        case 'online':
          acc.online++;
          break;
        case 'warning':
          acc.warning++;
          break;
        case 'offline':
          acc.offline++;
          break;
        case 'never_connected':
          acc.never_connected++;
          break;
      }
      
      return acc;
    },
    { total: 0, online: 0, warning: 0, offline: 0, never_connected: 0 }
  );
}
