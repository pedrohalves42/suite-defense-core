import { UI_LABELS } from './labels';

// Helper function to get attack type label
export function getAttackTypeLabel(type: string): string {
  return UI_LABELS.attack_types[type as keyof typeof UI_LABELS.attack_types] || type;
}

// Helper function to get severity info
export function getSeverityInfo(severity: string): { label: string; emoji: string; description: string; badgeClass: string } {
  const key = severity.toLowerCase() as keyof typeof UI_LABELS.severity;
  return UI_LABELS.severity[key] || UI_LABELS.severity.info;
}

// Helper function to format time ago in friendly terms
export function formatTimeAgoFriendly(seconds: number): string {
  if (seconds < 60) return UI_LABELS.time.now;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} ${UI_LABELS.time.minutes_ago}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ${UI_LABELS.time.hours_ago}`;
  return `${Math.floor(seconds / 86400)} ${UI_LABELS.time.days_ago}`;
}

// Helper function to get compliance risk info
export function getComplianceRiskInfo(riskLevel: string) {
  const key = riskLevel as keyof typeof UI_LABELS.compliance.risk;
  return UI_LABELS.compliance.risk[key] || UI_LABELS.compliance.risk.MÉDIO;
}

// Helper function to get verification message
export function getVerificationMessage(sha256Valid: boolean, hmacValid: boolean): string {
  if (sha256Valid && hmacValid) {
    return UI_LABELS.compliance.verification.integrity_valid;
  }
  if (!sha256Valid) {
    return UI_LABELS.compliance.verification.sha256_invalid;
  }
  return UI_LABELS.compliance.verification.hmac_invalid;
}

// Helper function to get glossary term explanation
export function getGlossaryExplanation(term: string): string {
  const glossary = UI_LABELS.compliance.glossary as Record<string, { term: string; explanation: string }>;
  const entry = glossary[term.toLowerCase()];
  return entry ? entry.explanation : '';
}

// ===== AGENT STATUS HELPERS =====

export type AgentStatusKey = keyof typeof UI_LABELS.agent_status;

export function getAgentStatusLabel(status: string): string {
  const key = status as AgentStatusKey;
  return UI_LABELS.agent_status[key]?.label || status;
}

export function getAgentStatusInfo(status: string): {
  label: string;
  labelShort: string;
  description: string;
  color: string;
} {
  const key = status as AgentStatusKey;
  const info = UI_LABELS.agent_status[key];
  return info || {
    label: status,
    labelShort: '?',
    description: 'Status desconhecido',
    color: 'gray'
  };
}

export function getAgentKpiLabel(kpi: keyof typeof UI_LABELS.agent_kpis): string {
  return UI_LABELS.agent_kpis[kpi] || kpi;
}

export function getProcessesEmptyMessage(): typeof UI_LABELS.processes.empty {
  return UI_LABELS.processes.empty;
}

export function getProcessesErrorMessage(): typeof UI_LABELS.processes.error {
  return UI_LABELS.processes.error;
}

export function getProcessesLoadingMessage(): string {
  return UI_LABELS.processes.loading;
}
