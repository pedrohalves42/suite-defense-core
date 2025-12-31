/**
 * AI Insight Test Data
 * Contains fixtures for testing the AI Insight → Action Center cycle
 */

export const AI_INSIGHT_TEST_DATA = {
  // Test insight IDs
  insightIds: {
    agentOffline: 'i1000001-0001-0001-0001-000000000001',
    highCpu: 'i1000001-0001-0001-0001-000000000002',
    diskFull: 'i1000001-0001-0001-0001-000000000003',
    securityThreat: 'i1000001-0001-0001-0001-000000000004',
    stuckJobs: 'i1000001-0001-0001-0001-000000000005',
  },

  // Test action IDs
  actionIds: {
    restartAgent: 'a2000001-0001-0001-0001-000000000001',
    createDiagnostic: 'a2000001-0001-0001-0001-000000000002',
    cleanupJobs: 'a2000001-0001-0001-0001-000000000003',
    quarantineAgent: 'a2000001-0001-0001-0001-000000000004',
  },

  // Insight types for testing
  insightTypes: [
    'agent_health',
    'performance',
    'security',
    'compliance',
    'resource_usage',
  ] as const,

  // Action types for testing
  actionTypes: [
    'create_diagnostic_job',
    'create_system_alert',
    'suggest_agent_restart',
    'suggest_config_change',
    'suggest_job_cleanup',
    'delete_old_data',
    'quarantine_agent',
    'isolate_agent',
    'revoke_token',
    'cleanup_stuck_jobs',
  ] as const,

  // Severity levels
  severities: ['info', 'warning', 'error', 'critical'] as const,

  // Risk levels
  riskLevels: ['low', 'medium', 'high'] as const,

  // UI Labels (Portuguese)
  labels: {
    insights: {
      title: 'Insights de IA',
      empty: 'Nenhum insight disponível',
      acknowledge: 'Reconhecer',
      execute: 'Executar Ação',
      ignore: 'Ignorar',
    },
    actions: {
      title: 'Ações Recomendadas',
      pending: 'Pendente',
      executed: 'Executada',
      failed: 'Falhou',
      approved: 'Aprovada',
    },
    dialog: {
      confirmTitle: 'Confirmar Execução',
      confirmDescription: 'Deseja executar esta ação recomendada pela IA?',
      confirm: 'Confirmar',
      cancel: 'Cancelar',
    },
  },

  // Test tenant
  testTenant: {
    id: '75fd8eae-57ae-4870-a29b-9ed969d54ed5',
    name: 'Test Tenant',
  },

  // Test agent
  testAgent: {
    id: '768aaef4-333d-4e13-9a29-0267cc42a2ac',
    name: 'TEST-AGENT-001',
  },
};

/**
 * Create a mock AI Insight for testing
 */
export function createMockInsight(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    tenant_id: AI_INSIGHT_TEST_DATA.testTenant.id,
    agent_id: AI_INSIGHT_TEST_DATA.testAgent.id,
    insight_type: 'agent_health',
    title: 'Agente com problemas de conectividade',
    description: 'O agente TEST-AGENT-001 está apresentando falhas de heartbeat nas últimas 2 horas.',
    severity: 'warning',
    confidence_score: 0.85,
    evidence: {
      missed_heartbeats: 5,
      last_seen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    recommended_action: 'create_diagnostic_job',
    action_payload: {
      agent_name: AI_INSIGHT_TEST_DATA.testAgent.name,
      diagnostic_type: 'network',
      priority: 'high',
    },
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock AI Action for testing
 */
export function createMockAction(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    tenant_id: AI_INSIGHT_TEST_DATA.testTenant.id,
    insight_id: AI_INSIGHT_TEST_DATA.insightIds.agentOffline,
    action_type: 'create_diagnostic_job',
    action_payload: {
      agent_name: AI_INSIGHT_TEST_DATA.testAgent.name,
      diagnostic_type: 'full',
      priority: 'medium',
    },
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock action config for testing
 */
export function createMockActionConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    action_type: 'create_diagnostic_job',
    display_name: 'Criar Job de Diagnóstico',
    description: 'Cria um job de diagnóstico para o agente',
    is_enabled: true,
    requires_approval: false,
    risk_level: 'low',
    rate_limit_per_hour: 10,
    cooldown_minutes: 5,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Test routes for AI Insights
 */
export const AI_INSIGHT_ROUTES = {
  actionCenter: '/admin/action-center',
  insights: '/admin/insights',
  agentDetail: (agentId: string) => `/admin/agents/${agentId}`,
};

/**
 * Data-testid selectors for AI Insights
 */
export const AI_INSIGHT_SELECTORS = {
  // Insight list
  insightList: '[data-testid="insight-list"]',
  insightCard: '[data-testid="insight-card"]',
  insightTitle: '[data-testid="insight-title"]',
  insightSeverity: '[data-testid="insight-severity"]',
  insightConfidence: '[data-testid="insight-confidence"]',
  
  // Insight actions
  acknowledgeButton: '[data-testid="acknowledge-insight"]',
  executeButton: '[data-testid="execute-insight-action"]',
  ignoreButton: '[data-testid="ignore-insight"]',
  
  // Action execution
  actionDialog: '[data-testid="action-dialog"]',
  confirmExecute: '[data-testid="confirm-execute"]',
  cancelExecute: '[data-testid="cancel-execute"]',
  
  // Status indicators
  executionStatus: '[data-testid="execution-status"]',
  executionResult: '[data-testid="execution-result"]',
  
  // Loading states
  loadingSkeleton: '[data-testid="insight-skeleton"]',
  
  // Empty state
  emptyState: '[data-testid="empty-insights"]',
};

export default AI_INSIGHT_TEST_DATA;