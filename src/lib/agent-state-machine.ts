/**
 * Agent State Machine - Estados formais do agente
 * 
 * Define estados explícitos para lógica previsível e UI confiável.
 * Cada estado tem descrição, cor, ícone e ações disponíveis.
 */

import { Database } from '@/integrations/supabase/types';

type Agent = Database['public']['Tables']['agents']['Row'];

// Estados formais do agente (FSM Enterprise v2.0)
export type AgentState = 
  | 'healthy'           // Online, executando normalmente
  | 'degraded'          // Online, mas com problemas (throttled)
  | 'safe_mode'         // Proteção ativa, apenas operações essenciais
  | 'updating'          // Em processo de atualização
  | 'rollback'          // Voltando para versão anterior
  | 'isolated'          // Bloqueado por segurança
  | 'offline'           // Sem contato
  | 'quarantined'       // Requer intervenção manual
  | 'shutdown';         // Estado terminal (desinstalação/ordem explícita)

export interface StateDescription {
  label: string;
  description: string;
  color: 'success' | 'warning' | 'destructive' | 'info' | 'muted';
  icon: string;
  actions: string[];
  nextSteps: string;
}

// Descrições humanizadas para UI
export const STATE_DESCRIPTIONS: Record<AgentState, StateDescription> = {
  healthy: {
    label: 'Funcionando',
    description: 'Computador online e operando normalmente.',
    color: 'success',
    icon: 'check-circle',
    actions: ['view_details', 'run_scan', 'force_update'],
    nextSteps: 'Nenhuma ação necessária. O computador está saudável.'
  },
  degraded: {
    label: 'Com restrições',
    description: 'Computador online, mas com comunicação reduzida temporariamente.',
    color: 'warning',
    icon: 'alert-triangle',
    actions: ['view_details', 'remove_throttle', 'diagnostics'],
    nextSteps: 'Aguarde ou remova a limitação manualmente se necessário.'
  },
  safe_mode: {
    label: 'Modo Protegido',
    description: 'Proteção ativada automaticamente. Apenas operações essenciais.',
    color: 'warning',
    icon: 'shield-alert',
    actions: ['view_details', 'override_safe_mode', 'diagnostics'],
    nextSteps: 'Verifique a causa e force atualização se necessário.'
  },
  updating: {
    label: 'Atualizando',
    description: 'Computador está recebendo uma nova versão.',
    color: 'info',
    icon: 'download',
    actions: ['view_details'],
    nextSteps: 'Aguarde a conclusão da atualização.'
  },
  rollback: {
    label: 'Voltando versão',
    description: 'Computador está voltando para uma versão anterior.',
    color: 'warning',
    icon: 'rotate-ccw',
    actions: ['view_details', 'diagnostics'],
    nextSteps: 'Aguarde a conclusão. Se falhar, entrará em modo protegido.'
  },
  isolated: {
    label: 'Isolado',
    description: 'Computador bloqueado por segurança. Comunicação restrita.',
    color: 'destructive',
    icon: 'shield-off',
    actions: ['view_details', 'remove_isolation', 'diagnostics'],
    nextSteps: 'Verifique a razão do isolamento antes de remover.'
  },
  offline: {
    label: 'Sem contato',
    description: 'Computador não se comunica há algum tempo.',
    color: 'muted',
    icon: 'wifi-off',
    actions: ['view_details', 'diagnostics'],
    nextSteps: 'Verifique se o computador está ligado e conectado à internet.'
  },
  quarantined: {
    label: 'Quarentena',
    description: 'Computador requer intervenção manual urgente.',
    color: 'destructive',
    icon: 'alert-octagon',
    actions: ['view_details', 'remove_quarantine', 'diagnostics'],
    nextSteps: 'Ação manual necessária. Verifique os logs e contate suporte.'
  },
  shutdown: {
    label: 'Desligado',
    description: 'Computador em processo de desinstalação ou desligamento ordenado.',
    color: 'muted',
    icon: 'power-off',
    actions: ['view_details'],
    nextSteps: 'Estado terminal. Nenhuma ação disponível.'
  }
};

// Transições permitidas entre estados (FSM Enterprise v2.0)
export const STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  healthy: ['degraded', 'safe_mode', 'updating', 'isolated', 'offline'],
  degraded: ['healthy', 'safe_mode', 'isolated', 'offline', 'shutdown'],
  safe_mode: ['healthy', 'updating', 'offline', 'quarantined'],
  updating: ['healthy', 'rollback', 'offline'],
  rollback: ['healthy', 'safe_mode', 'offline', 'quarantined'],
  isolated: ['healthy', 'quarantined', 'offline'], // V-FIX: Allow isolated agents to go offline
  offline: ['healthy', 'degraded', 'safe_mode', 'isolated'],
  quarantined: ['healthy'],
  shutdown: []  // Terminal - sem saídas permitidas
};

import { AGENT_STATUS_THRESHOLDS } from './agent-status-constants';

// Usa thresholds centralizados para consistência absoluta
const OFFLINE_THRESHOLD_MINUTES = AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES;
const WARNING_THRESHOLD_MINUTES = AGENT_STATUS_THRESHOLDS.ONLINE_MAX_MINUTES; // Corrigido: Usar ONLINE_MAX como base para alerta

const UPDATE_WINDOW_MINUTES = 45; // Aumentado para 45min para evitar falsos "offline" durante builds lentos

/**
 * Deriva o estado formal do agente a partir dos dados do banco
 */
export function deriveAgentState(agent: Partial<Agent>): AgentState {
  // 1. Verificar quarentena (prioridade absoluta)
  if (agent.agent_state === 'quarantined') {
    return 'quarantined';
  }

  // 2. Verificar isolamento (prioridade máxima de segurança para máquinas conectadas)
  if (agent.is_isolated) {
    return 'isolated';
  }

  // 3. Verificar se está em processo de atualização forçada (prioridade sobre offline/degraded)
  if (agent.force_update_version && agent.force_update_at) {
    const forceUpdateTime = new Date(agent.force_update_at);
    const minutesSinceForceUpdate = (Date.now() - forceUpdateTime.getTime()) / (1000 * 60);
    
    // V-FIX: Only consider "updating" if versions still don't match 
    // to avoid stuck state after completion
    const versionMatches = agent.agent_version === agent.force_update_version;
    
    if (minutesSinceForceUpdate < UPDATE_WINDOW_MINUTES && !versionMatches) {
      return 'updating';
    }
  }

  // 4. Verificar batimento cardíaco (heartbeat)
  const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
  const diffMinutes = lastHeartbeat ? (Date.now() - lastHeartbeat.getTime()) / (1000 * 60) : Infinity;

  // 5. Verificar offline (Prioridade Crítica após checagem de processos ativos como atualização)
  if (diffMinutes >= OFFLINE_THRESHOLD_MINUTES) {
    return 'offline';
  }

  // 6. Verificar safe mode
  if (agent.safe_mode_entered_at && agent.safe_mode_reason) {
    return 'safe_mode';
  }

  // 7. Verificar instabilidade (degraded)
  if (diffMinutes >= WARNING_THRESHOLD_MINUTES || agent.is_throttled) {
    return 'degraded';
  }

  // 8. Verificar status do agente
  if (agent.status === 'active') {
    return 'healthy';
  }

  // 9. Default para offline se não conseguir determinar
  return 'offline';
}

/**
 * Retorna a descrição do estado atual
 */
export function getStateDescription(state: AgentState): StateDescription {
  return STATE_DESCRIPTIONS[state];
}

/**
 * Verifica se uma transição de estado é permitida
 */
export function isTransitionAllowed(fromState: AgentState, toState: AgentState): boolean {
  return STATE_TRANSITIONS[fromState]?.includes(toState) ?? false;
}

/**
 * Retorna as classes Tailwind para o estado
 */
export function getStateColorClasses(state: AgentState): {
  bg: string;
  text: string;
  border: string;
} {
  const colorMap: Record<StateDescription['color'], { bg: string; text: string; border: string }> = {
    success: {
      bg: 'bg-success/10',
      text: 'text-success',
      border: 'border-success/30'
    },
    warning: {
      bg: 'bg-warning/10',
      text: 'text-warning',
      border: 'border-warning/30'
    },
    destructive: {
      bg: 'bg-destructive/10',
      text: 'text-destructive',
      border: 'border-destructive/30'
    },
    info: {
      bg: 'bg-primary/10',
      text: 'text-primary',
      border: 'border-primary/30'
    },
    muted: {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      border: 'border-border'
    }
  };

  const description = STATE_DESCRIPTIONS[state];
  return colorMap[description.color];
}
