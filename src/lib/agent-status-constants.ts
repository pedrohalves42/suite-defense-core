/**
 * Constantes centralizadas para status de agentes
 * FONTE ÚNICA DA VERDADE para thresholds de status
 * 
 * Garante consistência entre:
 * - Dashboard principal
 * - AgentHealthMonitor
 * - SecurityMonitoring
 * - agent-utils.ts
 * - agent-state-machine.ts
 * - Views do banco (v_agent_state)
 * - RPCs (get_agent_health_metrics)
 */

export const AGENT_STATUS_THRESHOLDS = {
  // ========================================
  // Thresholds de Tempo Real (UI)
  // ========================================
  
  /** Até X minutos desde o último heartbeat = Online (verde) - COST-OPT v4: ajustado para heartbeat de 10min */
  ONLINE_MAX_MINUTES: 12,
  
  /** Entre ONLINE e WARNING = Intermitente (amarelo) */
  WARNING_MAX_MINUTES: 20,
  
  /** Mais de X minutos sem heartbeat = Offline (vermelho) */
  OFFLINE_MIN_MINUTES: 30,
  
  // ========================================
  // Thresholds de Alertas de Segurança
  // ========================================
  
  /** Após X horas sem heartbeat = Alerta de segurança (usado em SecurityMonitoring) */
  OFFLINE_ALERT_HOURS: 1,
  
  /** Após X horas sem heartbeat = Problema silencioso (usado em detecção de issues) */
  SILENT_PROBLEM_HOURS: 48,
  
  // ========================================
  // Cache e Performance
  // ========================================
  
  /** TTL de cache de status em segundos */
  CACHE_TTL_SECONDS: 30,
} as const;

/**
 * Labels padronizados para status de agentes
 * Usar em toda a UI para consistência
 */
export const AGENT_STATUS_LABELS = {
  healthy: 'Protegido',
  warning: 'Atenção',
  offline: 'Offline',
  critical: 'Crítico',
  never_connected: 'Nunca conectou',
  safe_mode: 'Modo Protegido',
  isolated: 'Isolado',
  degraded: 'Com Restrições',
  archived: 'Arquivado',
  updating: 'Atualizando',
} as const;

export type AgentStatusLabel = keyof typeof AGENT_STATUS_LABELS;

// ========================================
// Funções utilitárias centralizadas
// USAR ESTAS em vez de cálculos inline
// ========================================

/**
 * Determina se o agente está online baseado no heartbeat.
 * USA OS THRESHOLDS CENTRALIZADOS - não hardcode 5*60*1000 em outros arquivos!
 */
export function isAgentOnline(lastHeartbeat: string | null | undefined): boolean {
  if (!lastHeartbeat) return false;
  const elapsed = Date.now() - new Date(lastHeartbeat).getTime();
  return elapsed < AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000;
}

/**
 * Retorna o status calculado do agente: 'online' | 'warning' | 'offline' | 'never_connected'
 * Prioriza agent_state do banco quando disponível para consistência.
 */
export function getAgentOnlineStatus(
  agent: { last_heartbeat?: string | null; status?: string; agent_state?: string }
): 'online' | 'warning' | 'offline' | 'never_connected' {
  // 1. Priorizar agent_state do banco
  if (agent.agent_state) {
    switch (agent.agent_state) {
      case 'healthy':
      case 'enforcing':
        return 'online';
      case 'degraded':
      case 'recovery':
      case 'safe_mode':
      case 'updating':
      case 'rollback':
        return 'warning';
      case 'offline':
      case 'error':
      case 'shutdown':
      case 'isolated':
      case 'quarantined':
        return 'offline';
    }
  }

  // 2. Fallback para cálculo por heartbeat
  if (!agent.last_heartbeat) return 'never_connected';
  const minutesSince = (Date.now() - new Date(agent.last_heartbeat).getTime()) / (1000 * 60);
  if (minutesSince < AGENT_STATUS_THRESHOLDS.ONLINE_MAX_MINUTES) return 'online';
  if (minutesSince < AGENT_STATUS_THRESHOLDS.WARNING_MAX_MINUTES) return 'warning';
  return 'offline';
}

/** Milliseconds for offline threshold - use in place of hardcoded 5*60*1000 */
export const OFFLINE_THRESHOLD_MS = AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000;
