/**
 * Hook para buscar e processar causalidade de estado do agente
 * 
 * Responde: Por quê, quando, quem causou, o que acontece depois
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AgentState, deriveAgentState, getStateDescription } from '@/lib/agent-state-machine';
import { formatRelativeTime, formatDuration } from '@/lib/date-utils';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { logger } from '@/lib/logger';

export interface CausalEvent {
  id: string;
  type: 'decision' | 'rollback' | 'safe_mode' | 'isolation' | 'update';
  title: string;
  description: string;
  timestamp: string;
  formattedTime: string;
  rule_code?: string;
  evidence?: Record<string, unknown>;
  actor?: string; // quem causou (sistema, usuário, regra)
}

export interface StateTransition {
  fromState: AgentState;
  toState: AgentState;
  timestamp: string;
  formattedTime: string;
  reason: string;
  triggeredBy: 'rule' | 'manual' | 'system';
  ruleCode?: string;
  duration?: string; // quanto tempo ficou no estado anterior
}

export interface AgentCausality {
  currentState: AgentState;
  stateDescription: string;
  stateSince: string | null;
  formattedStateSince: string | null;
  causedBy: string;
  reason: string;
  nextSteps: string;
  overrideExpiresAt: string | null;
  events: CausalEvent[];
  stateTransitions: StateTransition[];
  timeInCurrentState?: string;
}

export function useAgentCausality(agentId: string | null, tenantId?: string | null) {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  
  // Usar tenantId explícito se fornecido, senão fallback para activeTenant
  const effectiveTenantId = tenantId || activeTenant?.id;
  
  return useQuery({
    queryKey: ['agent-causality', effectiveTenantId, agentId],
    queryFn: async (): Promise<AgentCausality | null> => {
      if (!agentId || !effectiveTenantId) return null;

      // ADR-026 Zero-Gap: Use RPC with explicit tenant_id (bypasses JWT sync issues)
      const { data: agentsList, error: rpcError } = await supabase.rpc('get_agents_list', {
        p_tenant_id: effectiveTenantId,
        p_include_archived: true, // Include archived to get full causality history
      });

      if (rpcError) {
        logger.error('[useAgentCausality] RPC error:', rpcError);
        return null;
      }

      const agent = (agentsList as unknown as Array<Record<string, unknown>>)?.find(
        (a) => a.id === agentId
      ) || null;

      if (!agent) {
        console.info('[useAgentCausality] Agent not found via RPC:', agentId, 'tenant:', effectiveTenantId);
        return null;
      }

      // Buscar últimos decision_events
      const { data: decisionEvents } = await supabase
        .from('decision_events')
        .select('id, agent_id, decision_type, rule_code, action, evidence, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Buscar últimos rollback_events
      const { data: rollbackEvents } = await supabase
        .from('agent_rollback_events')
        .select('id, agent_id, from_version, to_version, reason, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Buscar últimos safe_mode_events
      const { data: safeModeEvents } = await supabase
        .from('agent_safe_mode_events')
        .select('id, agent_id, reason, entered_at, resolved_at, resolved_by, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Derivar estado atual
      const currentState = deriveAgentState(agent);
      const stateDesc = getStateDescription(currentState);

      // Processar eventos causais
      const events: CausalEvent[] = [];

      // Adicionar decision events
      decisionEvents?.forEach(event => {
        events.push({
          id: event.id,
          type: 'decision',
          title: `Regra ${event.rule_code} executada`,
          description: event.action || 'Ação executada',
          timestamp: event.created_at,
          formattedTime: formatRelativeTime(event.created_at),
          rule_code: event.rule_code,
          evidence: event.evidence as Record<string, unknown> | undefined,
          actor: 'Sistema automático'
        });
      });

      // Adicionar rollback events
      rollbackEvents?.forEach(event => {
        events.push({
          id: event.id,
          type: 'rollback',
          title: `Rollback de ${event.from_version} para ${event.to_version}`,
          description: event.reason,
          timestamp: event.created_at || '',
          formattedTime: formatRelativeTime(event.created_at || ''),
          actor: 'Sistema automático'
        });
      });

      // Adicionar safe mode events
      safeModeEvents?.forEach(event => {
        events.push({
          id: event.id,
          type: 'safe_mode',
          title: event.resolved_at ? 'Modo protegido desativado' : 'Modo protegido ativado',
          description: event.reason,
          timestamp: event.entered_at,
          formattedTime: formatRelativeTime(event.entered_at),
          actor: event.resolved_by ? 'Usuário' : 'Sistema automático'
        });
      });

      // Ordenar eventos por timestamp
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Derivar transições de estado a partir dos eventos
      const stateTransitions = deriveStateTransitions(events, agent, currentState);

      // Determinar causa do estado atual
      let causedBy = 'Sistema';
      let reason = 'Estado normal de operação';
      let stateSince: string | null = null;
      let overrideExpiresAt: string | null = null;

      switch (currentState) {
        case 'isolated':
          causedBy = 'Segurança';
          reason = (agent.isolation_reason as string) || 'Isolado por motivo de segurança';
          stateSince = (agent.isolated_at as string | null);
          break;
        case 'safe_mode':
          causedBy = 'Proteção automática';
          reason = (agent.safe_mode_reason as string) || 'Proteção ativada após falhas';
          stateSince = (agent.safe_mode_entered_at as string | null);
          // Verificar se há override ativo
          if (agent.force_update_override_safe_mode_expires_at) {
            overrideExpiresAt = (agent.force_update_override_safe_mode_expires_at as string);
          }
          break;
        case 'degraded':
          causedBy = 'Sistema de proteção';
          reason = (agent.throttle_reason as string) || 'Comunicação reduzida para proteger o sistema';
          stateSince = (agent.throttled_at as string | null);
          break;
        case 'offline':
          causedBy = 'Perda de conexão';
          reason = 'Computador não se comunica há mais de 10 minutos';
          stateSince = (agent.last_heartbeat as string | null);
          break;
        case 'updating':
          causedBy = agent.force_update_reason ? 'Administrador' : 'Sistema';
          reason = (agent.force_update_reason as string) || 'Atualização em andamento';
          stateSince = (agent.force_update_at as string | null);
          break;
        case 'healthy':
          causedBy = 'Operação normal';
          reason = 'Computador funcionando sem problemas';
          stateSince = (agent.last_heartbeat as string | null);
          break;
      }

      // Calcular tempo no estado atual
      const timeInCurrentState = stateSince 
        ? formatDuration(new Date(stateSince), new Date())
        : undefined;

      return {
        currentState,
        stateDescription: stateDesc.description,
        stateSince,
        formattedStateSince: stateSince ? formatRelativeTime(stateSince) : null,
        causedBy,
        reason,
        nextSteps: stateDesc.nextSteps,
        overrideExpiresAt,
        events: events.slice(0, 10), // Limitar a 10 eventos
        stateTransitions,
        timeInCurrentState
      };
    },
    enabled: !!agentId && !tenantLoading && !!effectiveTenantId,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000)
  });
}

/**
 * Deriva transições de estado a partir dos eventos registrados
 */
function deriveStateTransitions(
  events: CausalEvent[],
  agent: Record<string, unknown>,
  currentState: AgentState
): StateTransition[] {
  const transitions: StateTransition[] = [];
  
  // Mapear tipos de evento para estados
  const eventStateMap: Record<string, { from: AgentState; to: AgentState }> = {
    'safe_mode': { from: 'healthy', to: 'safe_mode' },
    'rollback': { from: 'updating', to: 'safe_mode' },
    'isolation': { from: 'healthy', to: 'isolated' }
  };

  // Processar eventos para criar transições
  for (let i = 0; i < Math.min(events.length, 5); i++) {
    const event = events[i];
    const nextEvent = events[i + 1];

    let fromState: AgentState = 'healthy';
    let toState: AgentState = currentState;
    let triggeredBy: 'rule' | 'manual' | 'system' = 'system';

    // Determinar estados baseado no tipo de evento
    if (event.type === 'safe_mode') {
      if (event.title.includes('desativado')) {
        fromState = 'safe_mode';
        toState = 'healthy';
        triggeredBy = 'manual';
      } else {
        fromState = 'healthy';
        toState = 'safe_mode';
        triggeredBy = 'system';
      }
    } else if (event.type === 'rollback') {
      fromState = 'updating';
      toState = 'safe_mode';
      triggeredBy = 'system';
    } else if (event.type === 'decision') {
      triggeredBy = 'rule';
      // Inferir estados a partir da ação
      if (event.rule_code?.includes('ISOLATE')) {
        fromState = 'healthy';
        toState = 'isolated';
      } else if (event.rule_code?.includes('THROTTLE')) {
        fromState = 'healthy';
        toState = 'degraded';
      } else if (event.rule_code?.includes('SAFE_MODE')) {
        fromState = 'healthy';
        toState = 'safe_mode';
      }
    }

    // Calcular duração
    let duration: string | undefined;
    if (nextEvent) {
      const eventTime = new Date(event.timestamp);
      const nextEventTime = new Date(nextEvent.timestamp);
      duration = formatDuration(nextEventTime, eventTime);
    }

    transitions.push({
      fromState,
      toState,
      timestamp: event.timestamp,
      formattedTime: event.formattedTime,
      reason: event.description,
      triggeredBy,
      ruleCode: event.rule_code,
      duration
    });
  }

  return transitions;
}
