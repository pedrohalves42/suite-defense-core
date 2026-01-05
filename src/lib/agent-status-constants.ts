// Constantes centralizadas para status de agentes
// Garante consistência entre Dashboard, SecurityMonitoring e agent-utils

export const AGENT_STATUS_THRESHOLDS = {
  /** Até X minutos desde o último heartbeat = Online */
  ONLINE_MAX_MINUTES: 2,
  
  /** Entre ONLINE e WARNING = Intermitente */
  WARNING_MAX_MINUTES: 5,
  
  /** Após X horas sem heartbeat = Alerta de segurança (usado em SecurityMonitoring) */
  OFFLINE_ALERT_HOURS: 1,
} as const;
