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
  
  /** Até X minutos desde o último heartbeat = Online (verde) */
  ONLINE_MAX_MINUTES: 2,
  
  /** Entre ONLINE e WARNING = Intermitente (amarelo) */
  WARNING_MAX_MINUTES: 5,
  
  /** Mais de X minutos sem heartbeat = Offline (vermelho) */
  OFFLINE_MIN_MINUTES: 10,
  
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
