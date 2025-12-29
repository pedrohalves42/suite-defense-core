/**
 * DICIONÁRIO OFICIAL DE LINGUAGEM HUMANA - CyberShield
 * =====================================================
 * 
 * Este arquivo é a LEI DO PRODUTO para terminologia.
 * Nenhum termo técnico deve aparecer para o usuário final.
 * 
 * Princípios:
 * 1. O sistema nunca pressupõe conhecimento técnico
 * 2. Sempre responder: O que aconteceu? É problema? Preciso agir?
 * 3. Mostrar efeito, nunca mecanismo
 * 4. Toda ação parece reversível e segura
 */

// ============================================
// DICIONÁRIO PRINCIPAL - TERMOS PROIBIDOS → TRADUÇÃO
// ============================================

export const UI_DICTIONARY = {
  // Entidades principais
  agent: 'computador',
  agents: 'computadores',
  endpoint: 'computador',
  endpoints: 'computadores',
  
  // Jobs e tarefas
  job: 'verificação',
  jobs: 'verificações',
  task: 'tarefa',
  tasks: 'tarefas',
  execution: 'execução',
  
  // Segurança
  redTeam: 'teste de resistência',
  safeMode: 'modo de proteção',
  isolation: 'isolamento de segurança',
  isolate: 'isolar para segurança',
  throttle: 'limitação temporária',
  quarantine: 'quarentena',
  
  // IA e automação
  aiInsight: 'aviso inteligente',
  aiInsights: 'avisos inteligentes',
  aiAction: 'ação automática',
  aiActions: 'ações automáticas',
  confidenceGap: 'nível de confiança',
  
  // Logs e auditoria
  auditLog: 'histórico de segurança',
  auditLogs: 'histórico de segurança',
  log: 'registro',
  logs: 'registros',
  
  // Regras e automação
  trigger: 'ativação',
  triggered: 'ativado',
  rule: 'regra automática',
  rules: 'regras automáticas',
  policy: 'política',
  policies: 'políticas',
  
  // Eventos
  decisionEvent: 'decisão registrada',
  event: 'evento',
  incident: 'incidente',
  alert: 'alerta',
  
  // Status
  online: 'conectado',
  offline: 'desconectado',
  healthy: 'saudável',
  unhealthy: 'com problemas',
  pending: 'aguardando',
  completed: 'concluído',
  failed: 'falhou',
  
  // Ações
  deploy: 'instalar',
  rollback: 'reverter',
  execute: 'executar',
  approve: 'aprovar',
  reject: 'rejeitar',
} as const;

// ============================================
// LABELS DE SEÇÕES DO MENU (HUMANIZADOS)
// ============================================

export const MENU_SECTIONS = {
  overview: 'Visão Geral',
  monitoring: 'Monitoramento',
  security: 'Segurança',
  compliance: 'Conformidade',
  infrastructure: 'Infraestrutura',
  ai: 'Inteligência',
  management: 'Gestão',
  billing: 'Financeiro',
  superAdmin: 'Super Admin',
} as const;

// ============================================
// LABELS DE MENU HUMANIZADOS
// ============================================

export const MENU_LABELS = {
  // Usuário comum
  home: 'Início',
  realtime: 'Tempo Real',
  myComputers: 'Meus Computadores',
  verifications: 'Verificações',
  scans: 'Análises de Segurança',
  quarantine: 'Quarentena',
  installer: 'Instalador',
  export: 'Exportar',
  test: 'Testar',
  
  // Admin - Monitoramento
  dashboard: 'Painel Principal',
  monitoring: 'Tempo Real',
  agentHealth: 'Computadores Protegidos',
  
  // Admin - Segurança
  groups: 'Grupos',
  securityPolicies: 'Políticas de Proteção',
  securityAlerts: 'Alertas de Segurança',
  software: 'Programas Instalados',
  vulnerabilities: 'Vulnerabilidades',
  webActivity: 'Navegação Web',
  history: 'Histórico',
  reports: 'Relatórios',
  
  // Admin - Conformidade
  soc2: 'Prontidão SOC 2',
  complianceTimeline: 'Timeline de Conformidade',
  systemAudit: 'Auditoria do Sistema',
  
  // Admin - Infraestrutura
  installations: 'Instalações',
  releases: 'Versões',
  diagnostics: 'Diagnóstico',
  systemHealth: 'Saúde do Sistema',
  taskQueue: 'Fila de Tarefas',
  api: 'API',
  
  // Admin - IA (humanizado)
  insights: 'Avisos do Sistema',
  actions: 'Decisões Automáticas',
  aiMetrics: 'Métricas de IA',
  decisions: 'Histórico de Decisões',
  automationRules: 'Regras de Proteção',
  
  // Admin - Gestão
  team: 'Equipe',
  invites: 'Convites',
  settings: 'Configurações',
  notifications: 'Notificações',
  
  // Admin - Financeiro
  plans: 'Planos',
  subscriptions: 'Assinaturas',
} as const;

// ============================================
// MENSAGENS DE STATUS (AUTOEXPLICATIVAS)
// ============================================

export const STATUS_MESSAGES = {
  // Status global do sistema
  allGood: {
    title: 'Seu ambiente está protegido',
    description: 'O CyberShield está monitorando seus computadores e agindo automaticamente quando algo foge do normal.',
  },
  attention: {
    title: 'Atenção necessária',
    description: 'Identificamos comportamentos incomuns em alguns computadores. O sistema já tomou medidas preventivas.',
  },
  urgent: {
    title: 'Ação urgente',
    description: 'Existe risco que pode impactar sua operação. Revise os alertas abaixo.',
  },
  
  // O que o sistema fez
  systemActions: {
    blockedAccess: 'Bloqueou acessos inseguros',
    protectedMode: 'Colocou computador em modo de proteção',
    generatedWarnings: 'Gerou avisos importantes',
    awaitingConfirmation: 'Aguardando sua confirmação',
  },
} as const;

// ============================================
// HELPERS
// ============================================

/**
 * Traduz um termo técnico para linguagem humana
 */
export const humanize = (term: keyof typeof UI_DICTIONARY): string => {
  return UI_DICTIONARY[term] || term;
};

/**
 * Traduz um label de menu
 */
export const getMenuLabel = (key: keyof typeof MENU_LABELS): string => {
  return MENU_LABELS[key] || key;
};

/**
 * Traduz uma seção de menu
 */
export const getSectionLabel = (key: keyof typeof MENU_SECTIONS): string => {
  return MENU_SECTIONS[key] || key;
};

/**
 * Retorna a mensagem de status apropriada baseada no score de segurança
 */
export const getStatusMessage = (securityScore: number, criticalAlerts: number) => {
  if (securityScore >= 80 && criticalAlerts === 0) {
    return STATUS_MESSAGES.allGood;
  }
  if (securityScore >= 60 || criticalAlerts <= 2) {
    return STATUS_MESSAGES.attention;
  }
  return STATUS_MESSAGES.urgent;
};
