/**
 * E2E Test Configuration
 * Centralizes test credentials, URLs, and timeouts
 */

export const TEST_CONFIG = {
  // Test credentials - use environment variables from .env.test
  credentials: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'Test123!@#',
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
    rulesManagement: '/admin/rules-management',
    agentReleases: '/admin/agent-releases',
    problematicAgents: '/admin/problematic-agents',
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
    badgeThrottled: 'Velocidade Limitada',
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
    
    // Cards
    cardProtected: 'Protegidos',
    cardNeedAttention: 'Precisam de Atenção',
    cardOffline: 'Desligados',
    cardLiveConnections: 'Conexões ao Vivo',
    
    // Empty states
    emptyNoRules: 'Nenhuma regra configurada',
    emptyNoAgents: 'Nenhum computador encontrado',
  },
};

export default TEST_CONFIG;
