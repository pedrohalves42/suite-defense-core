/**
 * Hook para buscar e processar causalidade de estado do agente
 * 
 * Responde: Por quê, quando, quem causou, o que acontece depois
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AgentState, deriveAgentState, getStateDescription } from '@/lib/agent-state-machine';
import { formatRelativeTime } from '@/lib/date-utils';


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
}

export function useAgentCausality(agentId: string | null) {
  return useQuery({
    queryKey: ['agent-causality', agentId],
    queryFn: async (): Promise<AgentCausality | null> => {
      if (!agentId) return null;

      // Buscar dados do agente
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (agentError || !agent) {
        throw new Error('Computador não encontrado');
      }

      // Buscar últimos decision_events
      const { data: decisionEvents } = await supabase
        .from('decision_events')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Buscar últimos rollback_events
      const { data: rollbackEvents } = await supabase
        .from('agent_rollback_events')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Buscar últimos safe_mode_events
      const { data: safeModeEvents } = await supabase
        .from('agent_safe_mode_events')
        .select('*')
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

      // Determinar causa do estado atual
      let causedBy = 'Sistema';
      let reason = 'Estado normal de operação';
      let stateSince: string | null = null;
      let overrideExpiresAt: string | null = null;

      switch (currentState) {
        case 'isolated':
          causedBy = 'Segurança';
          reason = agent.isolation_reason || 'Isolado por motivo de segurança';
          stateSince = agent.isolated_at;
          break;
        case 'safe_mode':
          causedBy = 'Proteção automática';
          reason = agent.safe_mode_reason || 'Proteção ativada após falhas';
          stateSince = agent.safe_mode_entered_at;
          // Verificar se há override ativo
          if (agent.force_update_override_safe_mode_expires_at) {
            overrideExpiresAt = agent.force_update_override_safe_mode_expires_at;
          }
          break;
        case 'degraded':
          causedBy = 'Sistema de proteção';
          reason = agent.throttle_reason || 'Comunicação reduzida para proteger o sistema';
          stateSince = agent.throttled_at;
          break;
        case 'offline':
          causedBy = 'Perda de conexão';
          reason = 'Computador não se comunica há mais de 10 minutos';
          stateSince = agent.last_heartbeat;
          break;
        case 'updating':
          causedBy = agent.force_update_reason ? 'Administrador' : 'Sistema';
          reason = agent.force_update_reason || 'Atualização em andamento';
          stateSince = agent.force_update_at;
          break;
        case 'healthy':
          causedBy = 'Operação normal';
          reason = 'Computador funcionando sem problemas';
          stateSince = agent.last_heartbeat;
          break;
      }

      return {
        currentState,
        stateDescription: stateDesc.description,
        stateSince,
        formattedStateSince: stateSince ? formatRelativeTime(stateSince) : null,
        causedBy,
        reason,
        nextSteps: stateDesc.nextSteps,
        overrideExpiresAt,
        events: events.slice(0, 10) // Limitar a 10 eventos
      };
    },
    enabled: !!agentId,
    refetchInterval: 30000 // Atualizar a cada 30 segundos
  });
}
