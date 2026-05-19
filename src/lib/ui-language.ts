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

import { ptBR } from 'date-fns/locale';

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
  
  // Novos termos
  override: 'forçar atualização',
  forceUpdate: 'atualização forçada',
  heartbeat: 'sinal de vida',
  tenant: 'empresa',
  scan: 'verificação de segurança',
  hash: 'identificador único',
  payload: 'configurações',
  webhook: 'notificação automática',
  timeout: 'tempo esgotado',
  cleanup: 'limpeza',
  token: 'credencial de acesso',
  recovery: 'recuperação',
  emergency: 'emergência',
} as const;

export type UITermKey = keyof typeof UI_DICTIONARY;

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

export type MenuSectionKey = keyof typeof MENU_SECTIONS;

export const MENU_LABELS = {
  home: 'Início',
  realtime: 'Tempo Real',
  myComputers: 'Meus Computadores',
  verifications: 'Verificações',
  scans: 'Análises de Segurança',
  quarantine: 'Quarentena',
  installer: 'Instalador',
  export: 'Exportar',
  test: 'Testar',
  dashboard: 'Painel Principal',
  agentHealth: 'Computadores Protegidos',
  groups: 'Grupos',
  securityPolicies: 'Políticas de Proteção',
  securityAlerts: 'Alertas de Segurança',
  software: 'Programas Instalados',
  vulnerabilities: 'Vulnerabilidades',
  webActivity: 'Navegação Web',
  history: 'Histórico',
  reports: 'Relatórios',
  soc2: 'Prontidão SOC 2',
  complianceTimeline: 'Timeline de Conformidade',
  systemAudit: 'Auditoria do Sistema',
  installations: 'Instalações',
  releases: 'Versões',
  diagnostics: 'Diagnóstico',
  systemHealth: 'Saúde do Sistema',
  taskQueue: 'Fila de Tarefas',
  api: 'API',
  insights: 'Avisos do Sistema',
  actions: 'Decisões Automáticas',
  aiMetrics: 'Métricas de IA',
  decisions: 'Histórico de Decisões',
  automationRules: 'Regras de Proteção',
  team: 'Equipe',
  invites: 'Convites',
  settings: 'Configurações',
  notifications: 'Notificações',
  plans: 'Planos',
  subscriptions: 'Assinaturas',
} as const;

export type MenuLabelKey = keyof typeof MENU_LABELS;

export const UI_SENTENCES = {
  computerOk: 'Este computador está protegido.',
  computerAttention: 'Este computador precisa de atenção.',
  computerOffline: 'Este computador está desconectado.',
  computerIsolated: 'Este computador foi isolado por segurança.',
  systemActed: 'O sistema tomou uma ação automaticamente.',
  actionReversible: 'Esta ação pode ser revertida a qualquer momento.',
  actionApplied: 'Ação aplicada com sucesso.',
  actionFailed: 'Não foi possível aplicar a ação.',
  noActionNeeded: 'Você não precisa fazer nada agora.',
  actionPending: 'Sua confirmação é necessária.',
  reviewRecommended: 'Recomendamos revisar os detalhes abaixo.',
  waitMoment: 'Aguarde um momento...',
  verificationSuccess: 'Verificação concluída com sucesso.',
  verificationFailed: 'Não foi possível verificar este computador agora.',
  verificationPending: 'Verificação em andamento...',
  verificationScheduled: 'Verificação agendada.',
  threatBlocked: 'Ameaça bloqueada automaticamente.',
  riskDetected: 'Comportamento de risco detectado.',
  allClear: 'Nenhum problema encontrado.',
  protectionActive: 'Proteção ativa.',
  tryAgain: 'Tente novamente em alguns minutos.',
  contactSupport: 'Entre em contato com o suporte se o problema persistir.',
  connectionLost: 'Conexão perdida. Reconectando...',
  confirmAction: 'Tem certeza que deseja continuar?',
  actionConfirmed: 'Ação confirmada.',
  actionCancelled: 'Ação cancelada.',
  safeModePending: 'Este computador está em modo de proteção. Aguarde ou force a atualização.',
  overrideWarning: 'Esta ação ignora proteções de segurança. Use apenas em emergências.',
  overrideActive: 'Atualização forçada ativada por 30 minutos.',
  updateAvailable: 'Há uma atualização disponível para este computador.',
  updateForced: 'A atualização será aplicada automaticamente no próximo contato.',
  throttleRemoved: 'Limitação removida com sucesso.',
  isolationRemoved: 'Isolamento removido. Computador liberado.',
  cleanupSuccess: 'Computador limpo com sucesso.',
  cleanupDescription: 'Credenciais invalidadas e tarefas removidas.',
  selectComputer: 'Selecione um computador',
  noComputerAvailable: 'Nenhum computador disponível',
  allComputers: 'Todos os computadores',
  filterByComputer: 'Filtrar por computador',
} as const;

export type UISentenceKey = keyof typeof UI_SENTENCES;

export function t(key: UITermKey): string {
  return UI_DICTIONARY[key] || String(key);
}

export function menu(key: MenuLabelKey): string {
  return MENU_LABELS[key] || String(key);
}

export function section(key: MenuSectionKey): string {
  return MENU_SECTIONS[key] || String(key);
}

export function sentence(key: UISentenceKey): string {
  return UI_SENTENCES[key] || String(key);
}

export const humanize = t;
export const getMenuLabel = menu;
export const getSectionLabel = section;

export const DATE_LOCALE = ptBR;
