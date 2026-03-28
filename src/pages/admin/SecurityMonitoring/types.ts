export interface UnifiedEvent {
  id: string;
  type: string;
  label: string;
  detail: string;
  severity: string;
  created_at: string;
  source: string;
  agentName?: string;
  alertType?: string;
  remediable?: boolean;
  eventCategory: string;
  count: number;
}

export interface SecurityMetrics {
  rateLimitBreaches: number;
  failedLogins: number;
  blockedIps: number;
  criticalEvents: number;
  agentsOffline: number;
  blockedAttempts: number;
  activeAlerts: number;
  totalEvents: number;
}

export interface BlockedIP {
  id: string;
  ip_address: string;
  reason: string;
  blocked_until: string;
}

export interface FailedLoginStat {
  ip_address: string;
  count: number;
  last_attempt: string;
}

export interface ActiveAlert {
  id: string;
  title: string;
  severity: string;
  status: string;
  alert_type: string;
  created_at: string;
}

export interface ChartDataPoint {
  label: string;
  eventos: number;
  bloqueados: number;
  criticos: number;
}

export interface SecurityData {
  metrics: SecurityMetrics;
  unifiedEvents: UnifiedEvent[];
  blockedIPs: BlockedIP[];
  failedLoginStats: FailedLoginStat[];
  activeAlerts: ActiveAlert[];
  chartData: ChartDataPoint[];
  categoryCounts: Record<string, number>;
}

export type TimeRange = '1h' | '6h' | '24h' | '7d';

export const alertTypeLabels: Record<string, string> = {
  firewall_disabled: 'Firewall desativado',
  antivirus_inactive: 'Antivírus inativo',
  suspicious_process: 'Processo suspeito',
  unauthorized_access: 'Acesso não autorizado',
  malware_detected: 'Malware detectado',
  brute_force: 'Tentativa de força bruta',
  port_scan: 'Port scan',
  policy_violation: 'Violação de política',
  disk_critical: 'Disco crítico',
  service_stopped: 'Serviço parado',
  state_change: 'Mudança de estado',
};

export const remediableAlerts = new Set([
  'firewall_disabled', 'antivirus_inactive', 'service_stopped', 'policy_violation',
]);

export const severityConfig: Record<string, { label: string; dotColor: string; badgeBg: string; badgeText: string }> = {
  critical: { label: 'Crítico', dotColor: 'bg-red-500', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400' },
  high: { label: 'Alto', dotColor: 'bg-orange-500', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
  error: { label: 'Erro', dotColor: 'bg-orange-500', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
  warning: { label: 'Médio', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-400' },
  medium: { label: 'Médio', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-400' },
  info: { label: 'Info', dotColor: 'bg-blue-500', badgeBg: 'bg-blue-500/10', badgeText: 'text-blue-400' },
};

export const eventTypeLabels: Record<string, { label: string; color: string }> = {
  security_event: { label: 'Evento de segurança', color: 'text-red-400' },
  auto_repair: { label: 'Reparo automático', color: 'text-blue-400' },
  auto_recovery: { label: 'Restauração de serviço', color: 'text-emerald-400' },
  policy_drift: { label: 'Desvio de conformidade', color: 'text-amber-400' },
  state_change: { label: 'Mudança de estado', color: 'text-sky-400' },
  blocked_access: { label: 'Acesso bloqueado', color: 'text-red-400' },
};
