/**
 * diagnostic-humanizer.ts
 * 
 * Provides human-friendly explanations for diagnostic issues.
 * Maps technical issue_type keys to user-friendly titles, explanations, impacts, and suggested actions.
 */

export interface DiagnosticExplanation {
  title: string;
  explanation: string;
  impact: string;
  actions: string[];
}

export const DIAGNOSTIC_EXPLANATIONS: Record<string, DiagnosticExplanation> = {
  // Connectivity issues
  'no_heartbeat': {
    title: 'Agente Sem Comunicação',
    explanation: 'O computador não envia sinais de vida há mais de 10 minutos.',
    impact: 'Não é possível monitorar ou executar comandos remotos neste computador.',
    actions: [
      'Verificar se o computador está ligado',
      'Verificar conectividade de rede',
      'Verificar se o serviço CyberShield está rodando',
      'Verificar regras de firewall'
    ]
  },
  'stale_heartbeat': {
    title: 'Comunicação Atrasada',
    explanation: 'O computador está demorando mais que o esperado para enviar atualizações.',
    impact: 'Os dados exibidos podem estar desatualizados.',
    actions: [
      'Verificar carga de CPU no computador',
      'Verificar se há problemas de rede intermitentes'
    ]
  },
  'offline': {
    title: 'Computador Offline',
    explanation: 'O computador não está respondendo há um período prolongado.',
    impact: 'Impossível monitorar, executar tarefas ou coletar métricas.',
    actions: [
      'Verificar conectividade de rede',
      'Verificar se o computador está ligado',
      'Verificar status do serviço CyberShield'
    ]
  },

  // Resource issues
  'high_cpu': {
    title: 'Uso Elevado de CPU',
    explanation: 'O processador está trabalhando acima de 90% da capacidade.',
    impact: 'O computador pode ficar lento, travar ou não responder a tempo.',
    actions: [
      'Verificar processos consumindo CPU',
      'Identificar processos suspeitos',
      'Reiniciar serviços pesados',
      'Agendar verificação de malware'
    ]
  },
  'high_memory': {
    title: 'Memória RAM Elevada',
    explanation: 'A memória disponível está abaixo de 10% da capacidade total.',
    impact: 'Aplicações podem fechar inesperadamente ou o sistema pode travar.',
    actions: [
      'Verificar processos consumindo memória',
      'Fechar aplicações não essenciais',
      'Reiniciar o computador se necessário'
    ]
  },
  'high_disk': {
    title: 'Disco Quase Cheio',
    explanation: 'O espaço disponível no disco está abaixo de 10%.',
    impact: 'Pode impedir gravação de logs, atualizações e causar falhas no sistema.',
    actions: [
      'Limpar arquivos temporários',
      'Remover arquivos antigos',
      'Verificar logs crescentes',
      'Verificar lixeira'
    ]
  },
  'critical_disk': {
    title: 'Disco Crítico',
    explanation: 'O espaço disponível no disco está abaixo de 5%.',
    impact: 'Sistema pode parar de funcionar a qualquer momento.',
    actions: [
      'Ação imediata: liberar espaço',
      'Remover arquivos desnecessários',
      'Verificar logs e backups antigos'
    ]
  },

  // Security issues
  'no_token': {
    title: 'Credenciais Inválidas',
    explanation: 'O token de autenticação do agente está ausente ou expirado.',
    impact: 'O agente não consegue se comunicar com o servidor de forma segura.',
    actions: [
      'Gerar novo instalador',
      'Reinstalar o agente',
      'Verificar rotação de chaves'
    ]
  },
  'safe_mode': {
    title: 'Modo de Segurança Ativo',
    explanation: 'O agente entrou em modo de segurança devido a falhas consecutivas.',
    impact: 'Funcionalidades estão limitadas até intervenção manual.',
    actions: [
      'Investigar causa das falhas',
      'Autorizar recuperação do modo seguro',
      'Verificar logs de erro'
    ]
  },
  'isolated': {
    title: 'Agente Isolado',
    explanation: 'O agente foi isolado manualmente ou por política de segurança.',
    impact: 'Comunicação limitada, apenas comandos de recuperação são aceitos.',
    actions: [
      'Verificar motivo do isolamento',
      'Analisar eventos de segurança',
      'Remover isolamento quando seguro'
    ]
  },
  'throttled': {
    title: 'Agente Limitado',
    explanation: 'O agente está sob rate limiting devido a excesso de requisições.',
    impact: 'Algumas operações podem ser atrasadas ou rejeitadas.',
    actions: [
      'Aguardar período de cooldown',
      'Verificar configuração de polling',
      'Investigar causa do excesso de tráfego'
    ]
  },

  // Job issues
  'failed_jobs': {
    title: 'Tarefas Falhando',
    explanation: 'Uma ou mais tarefas agendadas falharam recentemente.',
    impact: 'Ações automáticas não estão sendo executadas corretamente.',
    actions: [
      'Verificar logs de erro das tarefas',
      'Retentar tarefas manualmente',
      'Investigar causa raiz'
    ]
  },
  'pending_jobs': {
    title: 'Tarefas Pendentes',
    explanation: 'Existem tarefas aguardando execução há muito tempo.',
    impact: 'Ações solicitadas podem estar atrasadas.',
    actions: [
      'Verificar status do agente',
      'Verificar conectividade',
      'Verificar fila de tarefas'
    ]
  },

  // Network issues
  'dns_failure': {
    title: 'Falha de DNS',
    explanation: 'O agente não consegue resolver nomes de domínio.',
    impact: 'Atualizações e comunicação podem falhar.',
    actions: [
      'Verificar configuração de DNS',
      'Testar resolução de nomes',
      'Verificar conectividade de rede'
    ]
  },
  'https_failure': {
    title: 'Falha de HTTPS',
    explanation: 'O agente não consegue estabelecer conexões seguras.',
    impact: 'Comunicação com o servidor está bloqueada.',
    actions: [
      'Verificar certificados SSL',
      'Verificar proxy corporativo',
      'Verificar regras de firewall'
    ]
  },

  // Update issues
  'update_failed': {
    title: 'Atualização Falhou',
    explanation: 'A última tentativa de atualização do agente falhou.',
    impact: 'O agente pode estar em versão desatualizada com vulnerabilidades.',
    actions: [
      'Verificar logs de atualização',
      'Tentar atualização manual',
      'Verificar permissões de escrita'
    ]
  },
  'outdated_version': {
    title: 'Versão Desatualizada',
    explanation: 'O agente está em uma versão antiga que não é mais suportada.',
    impact: 'Pode haver incompatibilidades e falhas de segurança.',
    actions: [
      'Agendar atualização',
      'Verificar se há bloqueios para atualização',
      'Forçar atualização se necessário'
    ]
  },

  // Generic
  'unknown': {
    title: 'Problema Detectado',
    explanation: 'Um problema foi identificado mas não foi classificado.',
    impact: 'Requer investigação manual para determinar impacto.',
    actions: [
      'Verificar logs do agente',
      'Coletar diagnóstico completo'
    ]
  }
};

/**
 * Gets a human-friendly explanation for a diagnostic issue type.
 * Falls back to 'unknown' if the issue type is not recognized.
 */
export function getHumanizedExplanation(issueType: string): DiagnosticExplanation {
  return DIAGNOSTIC_EXPLANATIONS[issueType] || DIAGNOSTIC_EXPLANATIONS['unknown'];
}

/**
 * Gets just the human-friendly title for an issue type.
 */
export function getHumanizedTitle(issueType: string): string {
  return getHumanizedExplanation(issueType).title;
}
