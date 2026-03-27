import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import type { AgentSnapshot } from './useAgentSnapshot';
import { logger } from '@/lib/logger';

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
      const { data, error } = await supabase.rpc('get_agents_snapshots_list', { 
        p_tenant_id: tenant?.id 
      });
      
      if (error) {
        logger.error('[useAgentSnapshots] Error:', error);
        throw new Error(error.message || 'Failed to fetch agent snapshots list');
      }
      
      return (data || []) as unknown as AgentSnapshot[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 60_000,
    refetchInterval: 300_000, // COST-OPT v8: 30s → 2min (snapshots via view, not critical path)
    refetchIntervalInBackground: false,
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
      never_connected: 0,
    };
  }

  return snapshots.reduce(
    (acc, snapshot) => {
      acc.total++;
      
      if (snapshot.agent_state) {
        switch (snapshot.agent_state) {
          case 'healthy':
          case 'enforcing':
          case 'syncing':
          case 'authenticating':
            acc.online++;
            break;
          case 'updating':
          case 'degraded':
          case 'recovery':
          case 'warning':
            acc.warning++;
            break;
          case 'error':
          case 'shutdown':
            acc.offline++;
            break;
          default:
            if (snapshot.online) acc.online++;
            else if (!snapshot.last_heartbeat) acc.never_connected++;
            else acc.offline++;
        }
      } else {
        // Fallback baseado em online/heartbeat
        if (snapshot.online) acc.online++;
        else if (!snapshot.last_heartbeat) acc.never_connected++;
        else acc.offline++;
      }
      
      return acc;
    },
    { total: 0, online: 0, warning: 0, offline: 0, never_connected: 0 }
  );
}
