import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { logger } from '@/lib/logger';

/**
 * AgentSnapshot - Contrato da Edge Function canônica
 * 
 * Fonte única de verdade para todas as UIs que exibem estado de agente.
 * Elimina dessincronização entre Monitoramento, Diagnóstico e Central de Ações.
 */
export interface AgentSnapshot {
  agent_id: string;
  tenant_id: string;
  hostname: string | null;
  os_type: string | null;
  version: string | null;
  last_heartbeat: string | null;
  online: boolean;
  latency_ms: number | null;
  agent_state: string | null;
  safe_mode: boolean;
  safe_mode_reason: string | null;
  is_isolated: boolean;
  is_throttled: boolean;
  active_issues: number;
  unresolved_insights: number;
  meta: {
    correlation_id: string;
    snapshot_at: string;
  };
}

/**
 * Hook para consumir snapshot canônico do agente
 * 
 * Uso:
 * ```tsx
 * const { data: snapshot, isLoading, error } = useAgentSnapshot(agentId);
 * if (snapshot?.online) { ... }
 * ```
 */
export function useAgentSnapshot(agentId?: string) {
  const { tenant, loading: tenantLoading } = useTenant();

  return useQuery({
    queryKey: ['agent-snapshot', agentId],
    queryFn: async (): Promise<AgentSnapshot> => {
      const { data, error } = await supabase.functions.invoke('agent-snapshot', {
        body: { agent_id: agentId }
      });
      
      if (error) {
        console.error('[useAgentSnapshot] Error:', error);
        throw new Error(error.message || 'Failed to fetch agent snapshot');
      }
      
      if (!data?.data) {
        throw new Error('No data returned from agent-snapshot');
      }
      
      return data.data as AgentSnapshot;
    },
    enabled: !tenantLoading && !!tenant?.id && !!agentId,
    staleTime: 30_000, // 30 segundos
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook para obter status calculado do agente (compatibilidade)
 * 
 * Converte agent_state para o formato usado pelo AgentMonitoring.
 */
export function getAgentStatusFromSnapshot(snapshot: AgentSnapshot | null | undefined): 'online' | 'warning' | 'offline' | 'never_connected' {
  if (!snapshot) return 'never_connected';
  
  // Priorizar agent_state do banco para consistência
  if (snapshot.agent_state) {
    switch (snapshot.agent_state) {
      case 'healthy':
      case 'enforcing':
        return 'online';
      case 'degraded':
      case 'recovery':
        return 'warning';
      case 'error':
      case 'shutdown':
      case 'isolated':
      case 'quarantined':
        return 'offline';
      case 'safe_mode':
      case 'updating':
      case 'rollback':
        return 'warning';
    }
  }
  
  // Fallback para online calculado
  if (snapshot.online) return 'online';
  if (!snapshot.last_heartbeat) return 'never_connected';
  
  // Calcular baseado em latência
  const latencyMinutes = (snapshot.latency_ms || 0) / 1000 / 60;
  if (latencyMinutes < 2) return 'online';
  if (latencyMinutes < 5) return 'warning';
  return 'offline';
}
