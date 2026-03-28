/**
 * Insight ? Action Mapping
 * 
 * This is the source of truth for how AI insights should be handled.
 * Used by:
 * - Action Center (UI)
 * - auto-execute-ai-actions (scheduled job)
 * - action-center-feed (POST handler)
 * - Audit logs (explainability)
 */

export type InsightExecutionMode = 'auto' | 'approval' | 'suggest';
export type InsightRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface InsightActionMapping {
  mode: InsightExecutionMode;
  handler: string | null;
  risk: InsightRiskLevel;
  human_label: string;
}

const INSIGHT_MAPPINGS: Record<string, InsightActionMapping> = {
  // Security - Antivirus
  antivirus_disabled: {
    mode: 'auto',
    handler: 'force_enable_antivirus',
    risk: 'high',
    human_label: 'Antivirus desativado ? reativar automaticamente'
  },
  antivirus_outdated: {
    mode: 'auto',
    handler: 'update_antivirus',
    risk: 'medium',
    human_label: 'Antivirus desatualizado ? atualizar'
  },

  // Security - Vulnerabilities
  vulnerability_critical: {
    mode: 'approval',
    handler: 'apply_patch',
    risk: 'critical',
    human_label: 'Vulnerabilidade critica ? aplicar correcao'
  },
  vulnerability_high: {
    mode: 'approval',
    handler: 'apply_patch',
    risk: 'high',
    human_label: 'Vulnerabilidade alta ? aplicar correcao'
  },

  // Security - Threats
  p2p_software_detected: {
    mode: 'approval',
    handler: 'isolate_agent',
    risk: 'high',
    human_label: 'Software P2P detectado ? isolar maquina'
  },
  dns_malicious_activity: {
    mode: 'auto',
    handler: 'block_domain',
    risk: 'critical',
    human_label: 'Atividade DNS maliciosa ? bloquear dominio'
  },
  process_anomaly: {
    mode: 'approval',
    handler: 'kill_process',
    risk: 'high',
    human_label: 'Processo suspeito ? encerrar'
  },
  suspicious_network_activity: {
    mode: 'approval',
    handler: 'isolate_agent',
    risk: 'high',
    human_label: 'Atividade de rede suspeita ? isolar agente'
  },

  // Agent Health
  agent_offline_suspicious: {
    mode: 'auto',
    handler: 'lock_user_sessions',
    risk: 'medium',
    human_label: 'Agente offline suspeito ? bloquear sessoes'
  },
  safe_mode_prolonged: {
    mode: 'approval',
    handler: 'reset_safe_mode',
    risk: 'high',
    human_label: 'Safe Mode ativo por muito tempo ? resetar'
  },
  agent_version_outdated: {
    mode: 'auto',
    handler: 'force_update_agent',
    risk: 'medium',
    human_label: 'Agente desatualizado ? forcar atualizacao'
  },

  // System Health
  anomaly_stuck_jobs: {
    mode: 'auto',
    handler: 'cleanup_stuck_jobs',
    risk: 'medium',
    human_label: 'Jobs travados detectados ? limpar'
  },
  job_failed_recurring: {
    mode: 'auto',
    handler: 'alert_admin',
    risk: 'medium',
    human_label: 'Falhas recorrentes em jobs ? alertar administrador'
  },
  disk_usage_critical: {
    mode: 'suggest',
    handler: 'notify_user',
    risk: 'high',
    human_label: 'Uso de disco critico ? notificar usuario'
  },
  memory_usage_high: {
    mode: 'suggest',
    handler: 'notify_user',
    risk: 'medium',
    human_label: 'Uso de memoria alto ? notificar usuario'
  },

  // Compliance
  unauthorized_software: {
    mode: 'approval',
    handler: 'uninstall_software',
    risk: 'medium',
    human_label: 'Software nao autorizado ? desinstalar'
  },
  policy_violation: {
    mode: 'suggest',
    handler: 'notify_admin',
    risk: 'medium',
    human_label: 'Violacao de politica ? notificar administrador'
  },
};

const DEFAULT_MAPPING: InsightActionMapping = {
  mode: 'suggest',
  handler: null,
  risk: 'low',
  human_label: 'Acao sugerida ? aguarda decisao manual'
};

/**
 * Maps an insight type to its corresponding action configuration.
 * 
 * @param insightType - The type of the AI insight
 * @returns The action mapping configuration
 */
export function mapInsightToAction(insightType: string): InsightActionMapping {
  return INSIGHT_MAPPINGS[insightType] || DEFAULT_MAPPING;
}

/**
 * Checks if an insight type should be auto-executed
 * 
 * @param insightType - The type of the AI insight
 * @returns True if the insight should be auto-executed
 */
export function shouldAutoExecute(insightType: string): boolean {
  const mapping = mapInsightToAction(insightType);
  return mapping.mode === 'auto' && mapping.handler !== null;
}

/**
 * Checks if an insight type requires approval
 * 
 * @param insightType - The type of the AI insight
 * @returns True if the insight requires approval
 */
export function requiresApproval(insightType: string): boolean {
  const mapping = mapInsightToAction(insightType);
  return mapping.mode === 'approval';
}

/**
 * Get all insight types that can be auto-executed
 * 
 * @returns Array of insight types with auto mode
 */
export function getAutoExecutableTypes(): string[] {
  return Object.entries(INSIGHT_MAPPINGS)
    .filter(([_, mapping]) => mapping.mode === 'auto' && mapping.handler !== null)
    .map(([type, _]) => type);
}

/**
 * Get the human-readable label for an insight action
 * 
 * @param insightType - The type of the AI insight
 * @returns Human-readable description of the action
 */
export function getActionLabel(insightType: string): string {
  return mapInsightToAction(insightType).human_label;
}
