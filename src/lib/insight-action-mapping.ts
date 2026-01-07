/**
 * Frontend version of insight-action-mapping
 * Mirrors the edge function version for UI consistency
 */

export type InsightExecutionMode = 'auto' | 'approval' | 'suggest';
export type InsightRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SuggestedAction {
  label: string;
  action: string;
  requires_approval?: boolean;
  icon?: string;
}

export interface InsightActionMapping {
  mode: InsightExecutionMode;
  handler: string | null;
  risk: InsightRiskLevel;
  human_label: string;
  suggested_actions?: SuggestedAction[];
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
    suggested_actions: [
      { label: 'Reativar antivírus', action: 'force_enable_antivirus', icon: 'Shield' },
      { label: 'Verificar política', action: 'check_policy', icon: 'FileCheck' },
    ],
  },
  antivirus_outdated: {
    mode: 'auto',
    handler: 'update_antivirus',
    risk: 'medium',
    human_label: 'Antivírus desatualizado — atualizar',
    suggested_actions: [
      { label: 'Atualizar definições', action: 'update_antivirus', icon: 'RefreshCw' },
    ],
  },

  // Vulnerabilities
  vulnerability_critical: {
    mode: 'approval',
    handler: 'apply_patch',
    risk: 'critical',
    human_label: 'Vulnerabilidade crítica — aplicar correção',
    suggested_actions: [
      { label: 'Aplicar patch', action: 'apply_patch', requires_approval: true, icon: 'Download' },
      { label: 'Isolar máquina', action: 'isolate_agent', requires_approval: true, icon: 'ShieldOff' },
      { label: 'Ver CVE', action: 'view_cve', icon: 'ExternalLink' },
    ],
  },
  vulnerability_high: {
    mode: 'approval',
    handler: 'apply_patch',
    risk: 'high',
    human_label: 'Vulnerabilidade alta — aplicar correção',
    suggested_actions: [
      { label: 'Aplicar patch', action: 'apply_patch', requires_approval: true, icon: 'Download' },
      { label: 'Agendar correção', action: 'schedule_patch', icon: 'Calendar' },
    ],
  },

  // Anomaly Detection (NEW - main focus)
  anomaly_detection: {
    mode: 'suggest',
    handler: null,
    risk: 'medium',
    human_label: 'Anomalia detectada — investigar',
    suggested_actions: [
      { label: 'Ver métricas do agente', action: 'navigate_agent', icon: 'Activity' },
      { label: 'Coletar diagnóstico', action: 'collect_diagnostics', icon: 'FileSearch' },
      { label: 'Reiniciar serviços', action: 'restart_services', requires_approval: true, icon: 'RefreshCw' },
      { label: 'Isolar temporariamente', action: 'isolate_agent', requires_approval: true, icon: 'ShieldOff' },
    ],
  },
  anomaly: {
    mode: 'suggest',
    handler: null,
    risk: 'medium',
    human_label: 'Comportamento anômalo detectado',
    suggested_actions: [
      { label: 'Ver detalhes', action: 'navigate_agent', icon: 'Eye' },
      { label: 'Coletar logs', action: 'collect_logs', icon: 'FileText' },
    ],
  },

  // Performance issues
  performance: {
    mode: 'suggest',
    handler: null,
    risk: 'low',
    human_label: 'Problema de performance detectado',
    suggested_actions: [
      { label: 'Ver métricas', action: 'navigate_agent', icon: 'BarChart3' },
      { label: 'Otimizar recursos', action: 'optimize_resources', icon: 'Zap' },
      { label: 'Reiniciar agente', action: 'restart_agent', requires_approval: true, icon: 'RotateCcw' },
    ],
  },

  // Security posture
  security_posture: {
    mode: 'suggest',
    handler: null,
    risk: 'medium',
    human_label: 'Postura de segurança comprometida',
    suggested_actions: [
      { label: 'Revisar configurações', action: 'review_config', icon: 'Settings' },
      { label: 'Aplicar baseline', action: 'apply_baseline', requires_approval: true, icon: 'Shield' },
      { label: 'Ver recomendações', action: 'view_recommendations', icon: 'Lightbulb' },
    ],
  },

  // Software threats
  p2p_software_detected: {
    mode: 'approval',
    handler: 'isolate_agent',
    risk: 'high',
    human_label: 'Software P2P detectado — isolar máquina',
    suggested_actions: [
      { label: 'Isolar máquina', action: 'isolate_agent', requires_approval: true, icon: 'ShieldOff' },
      { label: 'Remover software', action: 'remove_software', requires_approval: true, icon: 'Trash2' },
    ],
  },
  unauthorized_software: {
    mode: 'approval',
    handler: 'block_software',
    risk: 'medium',
    human_label: 'Software não autorizado — bloquear',
    suggested_actions: [
      { label: 'Bloquear execução', action: 'block_software', requires_approval: true, icon: 'Ban' },
      { label: 'Adicionar à lista branca', action: 'whitelist', requires_approval: true, icon: 'CheckCircle' },
    ],
  },

  // Network threats
  dns_malicious_activity: {
    mode: 'auto',
    handler: 'block_domain',
    risk: 'critical',
    human_label: 'Tentativas DNS maliciosas — bloquear domínio',
    suggested_actions: [
      { label: 'Bloquear domínio', action: 'block_domain', icon: 'Ban' },
      { label: 'Ver conexões', action: 'view_connections', icon: 'Network' },
    ],
  },
  suspicious_network_connection: {
    mode: 'approval',
    handler: 'block_connection',
    risk: 'high',
    human_label: 'Conexão suspeita — bloquear',
    suggested_actions: [
      { label: 'Bloquear conexão', action: 'block_connection', requires_approval: true, icon: 'Ban' },
      { label: 'Investigar tráfego', action: 'investigate_traffic', icon: 'Search' },
    ],
  },

  // Process anomalies
  process_anomaly: {
    mode: 'approval',
    handler: 'kill_process',
    risk: 'high',
    human_label: 'Processo suspeito — encerrar',
    suggested_actions: [
      { label: 'Encerrar processo', action: 'kill_process', requires_approval: true, icon: 'XCircle' },
      { label: 'Analisar processo', action: 'analyze_process', icon: 'Search' },
    ],
  },
  suspicious_process: {
    mode: 'approval',
    handler: 'kill_process',
    risk: 'high',
    human_label: 'Processo suspeito — encerrar',
    suggested_actions: [
      { label: 'Encerrar processo', action: 'kill_process', requires_approval: true, icon: 'XCircle' },
      { label: 'Ver detalhes', action: 'view_process', icon: 'Eye' },
    ],
  },

  // Agent health
  agent_offline_suspicious: {
    mode: 'auto',
    handler: 'lock_user_sessions',
    risk: 'medium',
    human_label: 'Agente offline suspeito — bloquear sessões',
    suggested_actions: [
      { label: 'Bloquear sessões', action: 'lock_user_sessions', icon: 'Lock' },
      { label: 'Tentar reconexão', action: 'ping_agent', icon: 'Wifi' },
    ],
  },
  safe_mode_prolonged: {
    mode: 'approval',
    handler: 'reset_safe_mode',
    risk: 'high',
    human_label: 'Safe Mode ativo por muito tempo — resetar',
    suggested_actions: [
      { label: 'Resetar safe mode', action: 'reset_safe_mode', requires_approval: true, icon: 'RotateCcw' },
      { label: 'Ver histórico', action: 'view_history', icon: 'History' },
    ],
  },
  agent_tampering: {
    mode: 'auto',
    handler: 'isolate_agent',
    risk: 'critical',
    human_label: 'Tentativa de manipulação do agente — isolar',
    suggested_actions: [
      { label: 'Isolar máquina', action: 'isolate_agent', icon: 'ShieldOff' },
      { label: 'Alertar SOC', action: 'alert_soc', icon: 'Bell' },
    ],
  },

  // System health
  disk_full_critical: {
    mode: 'suggest',
    handler: 'alert_admin',
    risk: 'medium',
    human_label: 'Disco quase cheio — alertar administrador',
    suggested_actions: [
      { label: 'Ver uso de disco', action: 'view_disk', icon: 'HardDrive' },
      { label: 'Limpar temporários', action: 'cleanup_temp', requires_approval: true, icon: 'Trash2' },
    ],
  },
  high_cpu_sustained: {
    mode: 'suggest',
    handler: 'alert_admin',
    risk: 'low',
    human_label: 'CPU alta sustentada — monitorar',
    suggested_actions: [
      { label: 'Ver processos', action: 'view_processes', icon: 'Cpu' },
      { label: 'Coletar diagnóstico', action: 'collect_diagnostics', icon: 'FileSearch' },
    ],
  },

  // Job failures
  job_failed_recurring: {
    mode: 'auto',
    handler: 'alert_admin',
    risk: 'medium',
    human_label: 'Falhas recorrentes — alertar administrador',
    suggested_actions: [
      { label: 'Ver logs de jobs', action: 'view_job_logs', icon: 'FileText' },
      { label: 'Reexecutar job', action: 'retry_job', icon: 'RefreshCw' },
    ],
  },
  anomaly_stuck_jobs: {
    mode: 'auto',
    handler: 'cleanup_stuck_jobs',
    risk: 'low',
    human_label: 'Jobs travados — limpar automaticamente',
    suggested_actions: [
      { label: 'Limpar jobs', action: 'cleanup_stuck_jobs', icon: 'Trash2' },
      { label: 'Ver fila', action: 'view_queue', icon: 'List' },
    ],
  },

  // Compliance and optimization
  compliance: {
    mode: 'suggest',
    handler: null,
    risk: 'medium',
    human_label: 'Problema de conformidade',
    suggested_actions: [
      { label: 'Ver detalhes', action: 'view_compliance', icon: 'ClipboardCheck' },
      { label: 'Aplicar correção', action: 'apply_fix', requires_approval: true, icon: 'Wrench' },
    ],
  },
  optimization: {
    mode: 'suggest',
    handler: null,
    risk: 'low',
    human_label: 'Oportunidade de otimização',
    suggested_actions: [
      { label: 'Ver sugestões', action: 'view_suggestions', icon: 'Lightbulb' },
    ],
  },
  predictive: {
    mode: 'suggest',
    handler: null,
    risk: 'medium',
    human_label: 'Risco futuro previsto',
    suggested_actions: [
      { label: 'Ver previsão', action: 'view_prediction', icon: 'TrendingUp' },
      { label: 'Aplicar prevenção', action: 'apply_prevention', requires_approval: true, icon: 'Shield' },
    ],
  },
  root_cause: {
    mode: 'suggest',
    handler: null,
    risk: 'medium',
    human_label: 'Causa raiz identificada',
    suggested_actions: [
      { label: 'Ver análise', action: 'view_analysis', icon: 'GitBranch' },
      { label: 'Resolver causa', action: 'resolve_root_cause', requires_approval: true, icon: 'CheckCircle' },
    ],
  },
  threat_intel: {
    mode: 'approval',
    handler: null,
    risk: 'high',
    human_label: 'Indicador de ameaça detectado',
    suggested_actions: [
      { label: 'Investigar', action: 'investigate_threat', icon: 'Search' },
      { label: 'Bloquear IOC', action: 'block_ioc', requires_approval: true, icon: 'Ban' },
    ],
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
  suggested_actions: [
    { label: 'Ver detalhes', action: 'view_details', icon: 'Eye' },
  ],
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

/**
 * Get suggested actions for an insight type
 */
export function getSuggestedActions(insightType: string): SuggestedAction[] {
  return mapInsightToAction(insightType).suggested_actions || [];
}
