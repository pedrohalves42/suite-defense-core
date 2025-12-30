/**
 * E2E Test Configuration
 * Centralizes test credentials, URLs, and timeouts
 */

export const TEST_CONFIG = {
  // Test credentials - use environment variables from .env.test
  credentials: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
  },
  
  // Timeouts
  timeouts: {
    navigation: 30000,
    networkIdle: 10000,
    element: 5000,
    animation: 500,
  },
  
  // Routes
  routes: {
    login: '/login',
    dashboard: '/admin/dashboard',
    agentHealth: '/admin/agent-health-monitor',
    dnsFilter: '/admin/dns-filter',
    blockedWebsites: '/admin/blocked-websites',
    rulesManagement: '/admin/rules-management',
    agentReleases: '/admin/agent-releases',
    problematicAgents: '/admin/problematic-agents',
    installer: '/installer',
    agentInstaller: '/agent-installer',
    planUpgrade: '/admin/plan-upgrade',
    installationAnalytics: '/admin/installation-analytics',
    installationLogs: '/admin/installation-logs',
    installationPipeline: '/admin/installation-pipeline',
  },
  
  // Expected texts (Portuguese - humanized)
  texts: {
    // Page titles
    agentHealthTitle: 'Status dos Computadores',
    agentHealthSubtitle: 'Veja se todos os seus computadores estão funcionando bem',
    rulesManagementTitle: 'Gerenciamento de Regras',
    rulesManagementSubtitle: 'Configure as regras do motor de decisão automática',
    agentReleasesTitle: 'Versões do Programa',
    problematicAgentsTitle: 'Computadores com Problemas',
    
    // Tabs
    tabAll: 'Todos',
    tabProblems: 'Problemas',
    tabProtected: 'Protegidos',
    tabOffline: 'Offline',
    
    // Badges
    badgeThrottled: 'Comunicação Reduzida',
    badgeIsolated: 'Isolado',
    badgeSafeMode: 'Modo Protegido',
    
    // Buttons
    buttonRefresh: 'Atualizar',
    buttonExecute: 'Executar Agora',
    
    // Rule names
    ruleErrorProtection: 'Proteção contra Erros Repetidos',
    ruleSpeedLimiter: 'Limitador de Velocidade',
    ruleEmergencyIsolation: 'Isolamento de Emergência',
    ruleVersionBlock: 'Bloqueio de Versões Problemáticas',
    
    // Cards - Health Monitor
    cardProtected: 'Protegidos',
    cardNeedAttention: 'Precisam de Atenção',
    cardOffline: 'Desligados',
    cardLiveConnections: 'Conexões ao Vivo',
    cardHealthy: 'Saudáveis',
    cardAttention: 'Atenção',
    cardCritical: 'Crítico',
    
    // Health Monitor specific
    overallHealth: 'Saúde Geral',
    connectionReceived: 'Conexão recebida',
    errorLoadingHealth: 'Erro ao Carregar Monitor de Saúde',
    
    // Empty states
    emptyNoRules: 'Nenhuma regra configurada',
    emptyNoAgents: 'Nenhum computador encontrado',
    
    // DNS Filter
    dnsFilterTitle: 'DNS Filter',
    dnsFilterEnabled: 'Habilitado',
    dnsFilterDisabled: 'Desabilitado',
    dnsFilterInstallAll: 'Instalar em Todos',
    dnsFilterSyncAll: 'Sincronizar Todos',
    dnsFilterProtected: 'Protegido',
    dnsFilterNotInstalled: 'Não instalado',
  },
  
  // Data-testid selectors
  selectors: {
    // DNS Filter
    dnsFilterToggle: '[data-testid="dns-filter-toggle"]',
    dnsFilterInstallAll: '[data-testid="dns-filter-install-all"]',
    dnsFilterSyncAll: '[data-testid="dns-filter-sync-all"]',
    dnsFilterRefresh: '[data-testid="dns-filter-refresh"]',
    dnsFilterAgentList: '[data-testid="dns-filter-agent-list"]',
    dnsFilterAgentRow: '[data-testid="dns-filter-agent-row"]',
    
    // Agent Installer
    agentNameInput: '[data-testid="agent-name-input"]',
    generateCommandBtn: '[data-testid="generate-command-btn"]',
    installCommand: '[data-testid="install-command"]',
    validationSuccess: '[data-testid="validation-success"]',
    validationError: '[data-testid="validation-error"]',
    platformWindows: '[data-testid="platform-windows"]',
    platformLinux: '[data-testid="platform-linux"]',
    platformMacos: '[data-testid="platform-macos"]',
  },
};

export default TEST_CONFIG;
