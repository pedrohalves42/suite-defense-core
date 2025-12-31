/**
 * Frontend version of insight-action-mapping
 * Mirrors the edge function version for UI consistency
 */

export type InsightExecutionMode = 'auto' | 'approval' | 'suggest';
export type InsightRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface InsightActionMapping {
  mode: InsightExecutionMode;
  handler: string | null;
  risk: InsightRiskLevel;
  human_label: string;
}

/**
 * Central mapping of insight types to their action configurations
 * This is the "brain" of the Action Center
 */
export const INSIGHT_MAPPINGS: Record<string, InsightActionMapping> = {
  // Antivirus related
  antivirus_disabled: {
    mode: 'auto',
    handler: 'force_enable_antivirus',
    risk: 'high',
    human_label: 'Antivírus desativado — reativar automaticamente',
  },
  antivirus_outdated: {
    mode: 'auto',
    handler: 'update_antivirus',
    risk: 'medium',
    human_label: 'Antivírus desatualizado — atualizar',
  },

  // Vulnerabilities
  vulnerability_critical: {
    mode: 'approval',
    handler: 'apply_patch',
    risk: 'critical',
    human_label: 'Vulnerabilidade crítica — aplicar correção',
  },
  vulnerability_high: {
    mode: 'approval',
    handler: 'apply_patch',
    risk: 'high',
    human_label: 'Vulnerabilidade alta — aplicar correção',
  },

  // Software threats
  p2p_software_detected: {
    mode: 'approval',
    handler: 'isolate_agent',
    risk: 'high',
    human_label: 'Software P2P detectado — isolar máquina',
  },
  unauthorized_software: {
    mode: 'approval',
    handler: 'block_software',
    risk: 'medium',
    human_label: 'Software não autorizado — bloquear',
  },

  // Network threats
  dns_malicious_activity: {
    mode: 'auto',
    handler: 'block_domain',
    risk: 'critical',
    human_label: 'Tentativas DNS maliciosas — bloquear domínio',
  },
  suspicious_network_connection: {
    mode: 'approval',
    handler: 'block_connection',
    risk: 'high',
    human_label: 'Conexão suspeita — bloquear',
  },

  // Process anomalies
  process_anomaly: {
    mode: 'approval',
    handler: 'kill_process',
    risk: 'high',
    human_label: 'Processo suspeito — encerrar',
  },
  suspicious_process: {
    mode: 'approval',
    handler: 'kill_process',
    risk: 'high',
    human_label: 'Processo suspeito — encerrar',
  },

  // Agent health
  agent_offline_suspicious: {
    mode: 'auto',
    handler: 'lock_user_sessions',
    risk: 'medium',
    human_label: 'Agente offline suspeito — bloquear sessões',
  },
  safe_mode_prolonged: {
    mode: 'approval',
    handler: 'reset_safe_mode',
    risk: 'high',
    human_label: 'Safe Mode ativo por muito tempo — resetar',
  },
  agent_tampering: {
    mode: 'auto',
    handler: 'isolate_agent',
    risk: 'critical',
    human_label: 'Tentativa de manipulação do agente — isolar',
  },

  // System health
  disk_full_critical: {
    mode: 'suggest',
    handler: 'alert_admin',
    risk: 'medium',
    human_label: 'Disco quase cheio — alertar administrador',
  },
  high_cpu_sustained: {
    mode: 'suggest',
    handler: 'alert_admin',
    risk: 'low',
    human_label: 'CPU alta sustentada — monitorar',
  },

  // Job failures
  job_failed_recurring: {
    mode: 'auto',
    handler: 'alert_admin',
    risk: 'medium',
    human_label: 'Falhas recorrentes — alertar administrador',
  },
  anomaly_stuck_jobs: {
    mode: 'auto',
    handler: 'cleanup_stuck_jobs',
    risk: 'low',
    human_label: 'Jobs travados — limpar automaticamente',
  },
};

/**
 * Default mapping for unknown insight types
 */
export const DEFAULT_MAPPING: InsightActionMapping = {
  mode: 'suggest',
  handler: null,
  risk: 'low',
  human_label: 'Ação sugerida',
};

/**
 * Get the action mapping for an insight type
 */
export function mapInsightToAction(insightType: string): InsightActionMapping {
  return INSIGHT_MAPPINGS[insightType] || DEFAULT_MAPPING;
}

/**
 * Check if an insight type should auto-execute
 */
export function shouldAutoExecute(insightType: string): boolean {
  const mapping = mapInsightToAction(insightType);
  return mapping.mode === 'auto' && mapping.handler !== null;
}

/**
 * Check if an insight type requires approval
 */
export function requiresApproval(insightType: string): boolean {
  const mapping = mapInsightToAction(insightType);
  return mapping.mode === 'approval';
}

/**
 * Get all insight types that can be auto-executed
 */
export function getAutoExecutableTypes(): string[] {
  return Object.entries(INSIGHT_MAPPINGS)
    .filter(([_, mapping]) => mapping.mode === 'auto' && mapping.handler !== null)
    .map(([type]) => type);
}

/**
 * Get the human-readable label for an insight type
 */
export function getActionLabel(insightType: string): string {
  return mapInsightToAction(insightType).human_label;
}
