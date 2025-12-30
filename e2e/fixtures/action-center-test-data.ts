/**
 * Action Center E2E Test Data
 * Contains fixtures for testing the Action Center and Playbooks features
 */

export const ACTION_CENTER_TEST_DATA = {
  // Test execution IDs (must match what's in the database)
  executionIds: {
    urgentVulnerability: 'a1000001-0001-0001-0001-000000000001',
    urgentOffline: 'a1000001-0001-0001-0001-000000000002',
    urgentDns: 'a1000001-0001-0001-0001-000000000003',
    recommendedProcess: 'a1000001-0001-0001-0001-000000000004',
    recommendedPolicy: 'a1000001-0001-0001-0001-000000000005',
    infoAudit: 'a1000001-0001-0001-0001-000000000006',
    infoCertificate: 'a1000001-0001-0001-0001-000000000007',
  },

  // Expected urgent items count
  expectedCounts: {
    urgent: 3,
    recommended: 2,
    informational: 2,
    total: 7,
  },

  // Trigger types used in tests
  triggerTypes: [
    'vulnerability_critical',
    'agent_offline_24h',
    'dns_blocked_request',
    'suspicious_process',
    'policy_change',
    'weekly_audit',
    'certificate_expiring',
  ],

  // Severity levels
  severities: ['critical', 'high', 'medium', 'low'] as const,

  // Section titles in Portuguese
  sectionTitles: {
    urgent: 'Ações Urgentes',
    recommended: 'Ações Recomendadas',
    informational: 'Informativo',
  },

  // Button labels
  buttonLabels: {
    refresh: 'Atualizar',
    execute: 'Executar',
    ignore: 'Ignorar',
    acknowledge: 'Reconhecer',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    viewPlaybooks: 'Ver Playbooks',
  },

  // Dialog texts
  dialogTexts: {
    ignoreTitle: 'Ignorar Ação',
    ignoreDescription: 'Informe o motivo para ignorar esta ação',
    reasonPlaceholder: 'Falso positivo',
  },

  // Empty state texts
  emptyStateTexts: {
    title: 'Tudo em ordem!',
    description: 'Não há ações pendentes no momento',
    protected: 'computadores protegidos',
  },

  // Test data for creating new executions
  newExecution: {
    playbook_id: 'a1000000-0000-0000-0000-000000000001',
    status: 'pending',
    trigger_source: 'test_trigger',
    trigger_context: { test: true },
    risk_score: 5.0,
  },

  // Playbook names
  playbookNames: [
    'Resposta a Vulnerabilidade Crítica',
    'Recuperação de Agente Offline',
    'Alertas de Falha de Script',
    'Bloqueio de DNS Malicioso',
    'Tratamento de Processos',
    'Tratamento de Arquivo Suspeito',
    'Auditoria Periódica',
    'Alerta de Compliance',
    'Quarentena de Dispositivo',
    'Escalonamento Automático',
    'Política de Alteração',
    'Gestão de Certificados',
    'Análise de Incidente',
  ],
};

/**
 * Test routes for Action Center
 */
export const ACTION_CENTER_ROUTES = {
  dashboard: '/admin/action-center',
  playbooks: '/admin/playbooks',
  agentHealth: '/admin/agent-health',
};

/**
 * Data-testid selectors for Action Center
 */
export const ACTION_CENTER_SELECTORS = {
  // Dashboard elements
  actionCenterPage: '[data-testid="action-center-page"]',
  refreshButton: '[data-testid="action-center-refresh"]',
  viewPlaybooksLink: '[data-testid="view-playbooks-link"]',
  
  // Section elements
  urgentSection: '[data-testid="urgent-section"]',
  recommendedSection: '[data-testid="recommended-section"]',
  informationalSection: '[data-testid="informational-section"]',
  
  // Card elements
  actionCard: '[data-testid="action-card"]',
  executeButton: '[data-testid="execute-action"]',
  ignoreButton: '[data-testid="ignore-action"]',
  acknowledgeButton: '[data-testid="acknowledge-action"]',
  agentLink: '[data-testid="agent-link"]',
  
  // Dialog elements
  ignoreDialog: '[data-testid="ignore-dialog"]',
  ignoreReasonInput: '[data-testid="ignore-reason-input"]',
  confirmIgnoreButton: '[data-testid="confirm-ignore"]',
  cancelIgnoreButton: '[data-testid="cancel-ignore"]',
  
  // Empty state
  emptyState: '[data-testid="empty-action-center"]',
  healthyCount: '[data-testid="healthy-count"]',
  
  // Sidebar badge
  sidebarBadge: '[data-testid="action-center-badge"]',
  
  // Loading states
  loadingSkeleton: '[data-testid="action-center-skeleton"]',
};

/**
 * Create mock execution for testing
 */
export function createMockExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    playbook_id: 'a1000000-0000-0000-0000-000000000001',
    agent_id: '768aaef4-333d-4e13-9a29-0267cc42a2ac',
    tenant_id: '75fd8eae-57ae-4870-a29b-9ed969d54ed5',
    status: 'pending',
    trigger_source: 'test_trigger',
    trigger_context: { test: true },
    triggered_at: new Date().toISOString(),
    risk_score: 5.0,
    ...overrides,
  };
}

export default ACTION_CENTER_TEST_DATA;
