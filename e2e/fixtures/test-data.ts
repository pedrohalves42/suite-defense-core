/**
 * E2E Test Data Fixtures
 * Centralizes all test data for consistent and maintainable E2E tests
 */

// Agent test data
export const TEST_AGENTS = {
  valid: {
    name: 'e2e-test-agent-valid',
    displayName: 'E2E Test Agent',
    platform: 'windows' as const,
  },
  withNumbers: {
    name: 'test-agent-001',
    displayName: 'Test Agent 001',
    platform: 'windows' as const,
  },
  linux: {
    name: 'e2e-linux-server',
    displayName: 'Linux Test Server',
    platform: 'linux' as const,
  },
  macos: {
    name: 'e2e-macos-workstation',
    displayName: 'macOS Test Workstation',
    platform: 'macos' as const,
  },
};

// Invalid agent names for validation tests
export const INVALID_AGENT_NAMES = {
  tooShort: 'ab',
  tooLong: 'a'.repeat(51),
  specialChars: 'test@agent#invalid',
  spaces: 'test agent invalid',
  empty: '',
  onlyNumbers: '12345',
};

// Valid agent name patterns
export const VALID_AGENT_PATTERNS = {
  alphanumeric: 'testagent123',
  withDashes: 'test-agent-123',
  withUnderscores: 'test_agent_123',
  mixedCase: 'TestAgent123',
};

// DNS Filter test data
export const TEST_DNS_FILTER = {
  blockedDomains: [
    { domain: 'facebook.com', category: 'social' },
    { domain: 'twitter.com', category: 'social' },
    { domain: 'youtube.com', category: 'streaming' },
    { domain: 'tiktok.com', category: 'social' },
    { domain: 'instagram.com', category: 'social' },
  ],
  allowedDomains: [
    { domain: 'google.com', category: 'search' },
    { domain: 'github.com', category: 'development' },
    { domain: 'stackoverflow.com', category: 'development' },
  ],
  testCategories: ['social', 'streaming', 'gambling', 'adult', 'games'],
};

// Blocked websites for testing
export const TEST_BLOCKED_WEBSITES = {
  social: [
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'tiktok.com',
  ],
  streaming: [
    'youtube.com',
    'netflix.com',
    'twitch.tv',
  ],
  gambling: [
    'bet365.com',
    'pokerstars.com',
  ],
};

// User test data
export const TEST_USERS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'Test123!@#',
    role: 'admin' as const,
  },
  nonAdmin: {
    email: process.env.TEST_USER_EMAIL || 'user@test.com',
    password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
    role: 'member' as const,
  },
};

// Routes for navigation tests
export const TEST_ROUTES = {
  // Public routes
  login: '/login',
  register: '/register',
  
  // Admin routes
  dashboard: '/admin/dashboard',
  agentHealth: '/admin/agent-health-monitor',
  dnsFilter: '/admin/dns-filter',
  blockedWebsites: '/admin/blocked-websites',
  installationLogs: '/admin/installation-logs',
  installationPipeline: '/admin/installation-pipeline',
  rulesManagement: '/admin/rules-management',
  agentReleases: '/admin/agent-releases',
  problematicAgents: '/admin/problematic-agents',
  users: '/admin/users',
  settings: '/admin/settings',
  
  // Installer routes
  installer: '/installer',
};

// Test selectors using data-testid
export const TEST_SELECTORS = {
  // DNS Filter Manager
  dnsFilter: {
    toggle: '[data-testid="dns-filter-toggle"]',
    installAllBtn: '[data-testid="dns-filter-install-all"]',
    syncAllBtn: '[data-testid="dns-filter-sync-all"]',
    collectEventsBtn: '[data-testid="dns-filter-collect-events"]',
    refreshBtn: '[data-testid="dns-filter-refresh"]',
    agentList: '[data-testid="dns-filter-agent-list"]',
    agentRow: '[data-testid="dns-filter-agent-row"]',
    selectAllCheckbox: '[data-testid="dns-filter-select-all"]',
    statsOnline: '[data-testid="dns-filter-stats-online"]',
    statsInstalled: '[data-testid="dns-filter-stats-installed"]',
    statsPending: '[data-testid="dns-filter-stats-pending"]',
    statsSynced: '[data-testid="dns-filter-stats-synced"]',
  },
  
  // Agent Installer
  installer: {
    nameInput: '[data-testid="agent-name-input"]',
    platformWindows: '[data-testid="platform-windows"]',
    platformLinux: '[data-testid="platform-linux"]',
    platformMacos: '[data-testid="platform-macos"]',
    generateCommandBtn: '[data-testid="generate-command-btn"]',
    downloadScriptBtn: '[data-testid="download-script-btn"]',
    buildExeBtn: '[data-testid="build-exe-btn"]',
    installCommand: '[data-testid="install-command"]',
    copyCommandBtn: '[data-testid="copy-command-btn"]',
    validationSuccess: '[data-testid="validation-success"]',
    validationError: '[data-testid="validation-error"]',
  },
  
  // Common elements
  common: {
    loadingSpinner: '[data-testid="loading-spinner"]',
    errorAlert: '[data-testid="error-alert"]',
    successToast: '[data-testid="success-toast"]',
    emptyState: '[data-testid="empty-state"]',
    retryButton: '[data-testid="retry-button"]',
  },
  
  // Auth elements
  auth: {
    emailInput: 'input[type="email"]',
    passwordInput: 'input[type="password"]',
    submitButton: 'button[type="submit"]',
    loginForm: '[data-testid="login-form"]',
  },
};

// Timeouts for different operations
export const TEST_TIMEOUTS = {
  short: 3000,
  medium: 10000,
  long: 30000,
  pageLoad: 5000,
  networkIdle: 10000,
  animation: 500,
  debounce: 1000,
};

// Expected UI texts (Portuguese)
export const EXPECTED_TEXTS = {
  // DNS Filter
  dnsFilter: {
    pageTitle: 'DNS Filter',
    featureToggleLabel: 'DNS Filter Local',
    enabledStatus: 'Habilitado',
    disabledStatus: 'Desabilitado',
    installAllBtn: 'Instalar em Todos',
    syncAllBtn: 'Sincronizar Todos',
    collectEventsBtn: 'Coletar Eventos',
    protectedBadge: 'Protegido',
    offlineBadge: 'Offline',
    notInstalledBadge: 'Não instalado',
    installingBadge: 'Instalando...',
    syncingBadge: 'Sincronizando...',
  },
  
  // Agent Installer
  installer: {
    pageTitle: 'Instalador de Agente',
    generateCommand: 'Gerar Comando',
    downloadScript: 'Baixar Script',
    buildExe: 'Gerar .EXE',
    validName: 'disponível',
    invalidName: 'já existe',
    nameTooShort: 'mínimo 3 caracteres',
    nameTooLong: 'máximo 50 caracteres',
    invalidChars: 'caracteres inválidos',
  },
  
  // Common
  common: {
    loading: 'Carregando',
    error: 'Erro',
    success: 'Sucesso',
    retry: 'Tentar novamente',
    cancel: 'Cancelar',
    save: 'Salvar',
    delete: 'Excluir',
    edit: 'Editar',
    add: 'Adicionar',
  },
};

export default {
  TEST_AGENTS,
  INVALID_AGENT_NAMES,
  VALID_AGENT_PATTERNS,
  TEST_DNS_FILTER,
  TEST_BLOCKED_WEBSITES,
  TEST_USERS,
  TEST_ROUTES,
  TEST_SELECTORS,
  TEST_TIMEOUTS,
  EXPECTED_TEXTS,
};
