/**
 * diagnostic-humanizer.ts
 * 
 * Provides human-friendly explanations for diagnostic issues.
 * Maps technical issue_type keys to user-friendly titles, explanations, impacts, and suggested actions.
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface DiagnosticExplanation {
  title: string;
  explanation: string;
  impact: string;
  actions: string[];
  confidence: ConfidenceLevel;
  confidenceReason?: string;
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
    ],
    confidence: 'high',
    confidenceReason: 'Baseado em ausência de heartbeat por mais de 10 minutos'
  },
  'stale_heartbeat': {
    title: 'Comunicação Atrasada',
    explanation: 'O computador está demorando mais que o esperado para enviar atualizações.',
    impact: 'Os dados exibidos podem estar desatualizados.',
    actions: [
      'Verificar carga de CPU no computador',
      'Verificar se há problemas de rede intermitentes'
    ],
    confidence: 'medium',
    confidenceReason: 'Pode ser causado por carga de rede temporária'
  },
  'offline': {
    title: 'Computador Offline',
    explanation: 'O computador não está respondendo há um período prolongado.',
    impact: 'Impossível monitorar, executar tarefas ou coletar métricas.',
    actions: [
      'Verificar conectividade de rede',
      'Verificar se o computador está ligado',
      'Verificar status do serviço CyberShield'
    ],
    confidence: 'high',
    confidenceReason: 'Ausência prolongada confirmada por múltiplos checks'
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
    ],
    confidence: 'high',
    confidenceReason: 'Baseado em múltiplas métricas de CPU coletadas em tempo real'
  },
  'high_memory': {
    title: 'Memória RAM Elevada',
    explanation: 'A memória disponível está abaixo de 10% da capacidade total.',
    impact: 'Aplicações podem fechar inesperadamente ou o sistema pode travar.',
    actions: [
      'Verificar processos consumindo memória',
      'Fechar aplicações não essenciais',
      'Reiniciar o computador se necessário'
    ],
    confidence: 'high',
    confidenceReason: 'Métricas de memória confirmadas pelo sistema operacional'
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
    ],
    confidence: 'high',
    confidenceReason: 'Leitura direta do sistema de arquivos'
  },
  'critical_disk': {
    title: 'Disco Crítico',
    explanation: 'O espaço disponível no disco está abaixo de 5%.',
    impact: 'Sistema pode parar de funcionar a qualquer momento.',
    actions: [
      'Ação imediata: liberar espaço',
      'Remover arquivos desnecessários',
      'Verificar logs e backups antigos'
    ],
    confidence: 'high',
    confidenceReason: 'Situação crítica confirmada - ação imediata necessária'
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
    ],
    confidence: 'high',
    confidenceReason: 'Token ausente ou rejeitado pela API'
  },
  'safe_mode': {
    title: 'Modo de Segurança Ativo',
    explanation: 'O agente entrou em modo de segurança devido a falhas consecutivas.',
    impact: 'Funcionalidades estão limitadas até intervenção manual.',
    actions: [
      'Investigar causa das falhas',
      'Autorizar recuperação do modo seguro',
      'Verificar logs de erro'
    ],
    confidence: 'high',
    confidenceReason: 'Estado reportado diretamente pelo agente'
  },
  'isolated': {
    title: 'Agente Isolado',
    explanation: 'O agente foi isolado manualmente ou por política de segurança.',
    impact: 'Comunicação limitada, apenas comandos de recuperação são aceitos.',
    actions: [
      'Verificar motivo do isolamento',
      'Analisar eventos de segurança',
      'Remover isolamento quando seguro'
    ],
    confidence: 'high',
    confidenceReason: 'Isolamento registrado em log de auditoria'
  },
  'throttled': {
    title: 'Agente Limitado',
    explanation: 'O agente está sob rate limiting devido a excesso de requisições.',
    impact: 'Algumas operações podem ser atrasadas ou rejeitadas.',
    actions: [
      'Aguardar período de cooldown',
      'Verificar configuração de polling',
      'Investigar causa do excesso de tráfego'
    ],
    confidence: 'medium',
    confidenceReason: 'Baseado em contagem de requisições - pode ser temporário'
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
    ],
    confidence: 'high',
    confidenceReason: 'Falhas registradas no banco de dados'
  },
  'pending_jobs': {
    title: 'Tarefas Pendentes',
    explanation: 'Existem tarefas aguardando execução há muito tempo.',
    impact: 'Ações solicitadas podem estar atrasadas.',
    actions: [
      'Verificar status do agente',
      'Verificar conectividade',
      'Verificar fila de tarefas'
    ],
    confidence: 'medium',
    confidenceReason: 'Pode ser normal em agentes offline temporariamente'
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
    ],
    confidence: 'low',
    confidenceReason: 'Requer confirmação manual - pode ser falso positivo de rede'
  },
  'https_failure': {
    title: 'Falha de HTTPS',
    explanation: 'O agente não consegue estabelecer conexões seguras.',
    impact: 'Comunicação com o servidor está bloqueada.',
    actions: [
      'Verificar certificados SSL',
      'Verificar proxy corporativo',
      'Verificar regras de firewall'
    ],
    confidence: 'medium',
    confidenceReason: 'Pode ser causado por proxy ou firewall corporativo'
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
    ],
    confidence: 'high',
    confidenceReason: 'Falha registrada no processo de atualização'
  },
  'outdated_version': {
    title: 'Versão Desatualizada',
    explanation: 'O agente está em uma versão antiga que não é mais suportada.',
    impact: 'Pode haver incompatibilidades e falhas de segurança.',
    actions: [
      'Agendar atualização',
      'Verificar se há bloqueios para atualização',
      'Forçar atualização se necessário'
    ],
    confidence: 'high',
    confidenceReason: 'Comparação direta com versão mais recente disponível'
  },

  // Job types - novos diagnósticos
  'collect_web_activity': {
    title: 'Verificação de Sites Visitados',
    explanation: 'Coletando lista de sites que foram acessados no computador.',
    impact: 'Permite identificar se houve acesso a sites suspeitos ou não autorizados.',
    actions: ['Aguardar conclusão', 'Ver relatório depois'],
    confidence: 'high',
    confidenceReason: 'Coleta direta do histórico do navegador'
  },
  'software_inventory_collect': {
    title: 'Lista de Programas Instalados',
    explanation: 'Verificando todos os programas instalados no computador.',
    impact: 'Ajuda a encontrar programas desatualizados, não autorizados ou potencialmente perigosos.',
    actions: ['Ver lista de programas', 'Verificar atualizações pendentes'],
    confidence: 'high',
    confidenceReason: 'Leitura direta do registro de software do Windows'
  },
  'collect_antivirus_status': {
    title: 'Status do Antivírus',
    explanation: 'Verificando se o antivírus está ativo e atualizado.',
    impact: 'Computador sem antivírus ativo está vulnerável a vírus e malware.',
    actions: ['Ativar antivírus se desligado', 'Atualizar definições'],
    confidence: 'high',
    confidenceReason: 'Consulta direta ao Windows Security Center'
  },
  'collect_network_info': {
    title: 'Informações de Rede',
    explanation: 'Coletando dados sobre a conexão de rede do computador.',
    impact: 'Permite diagnosticar problemas de conectividade.',
    actions: ['Verificar configuração de rede', 'Testar conexões'],
    confidence: 'high',
    confidenceReason: 'Dados coletados diretamente do adaptador de rede'
  },
  'light_vuln_scan': {
    title: 'Busca por Vulnerabilidades',
    explanation: 'Verificando se há falhas de segurança conhecidas no sistema.',
    impact: 'Vulnerabilidades podem ser exploradas por atacantes.',
    actions: ['Aplicar atualizações de segurança', 'Revisar configurações'],
    confidence: 'medium',
    confidenceReason: 'Baseado em banco de dados de vulnerabilidades conhecidas'
  },
  'ping': {
    title: 'Teste de Conectividade',
    explanation: 'Verificando se o computador está respondendo.',
    impact: 'Confirma se o computador está online e acessível.',
    actions: ['Aguardar resposta'],
    confidence: 'high',
    confidenceReason: 'Resposta direta do agente'
  },
  'health_report': {
    title: 'Relatório de Saúde',
    explanation: 'Coletando métricas gerais do sistema (CPU, memória, disco).',
    impact: 'Visão geral do estado do computador.',
    actions: ['Analisar métricas', 'Identificar gargalos'],
    confidence: 'high',
    confidenceReason: 'Métricas coletadas em tempo real do sistema'
  },
  'collect_logs': {
    title: 'Coleta de Logs',
    explanation: 'Solicitando os registros de atividade do agente.',
    impact: 'Permite investigar problemas passados.',
    actions: ['Aguardar upload', 'Analisar logs'],
    confidence: 'high',
    confidenceReason: 'Logs armazenados localmente no computador'
  },
  'check_services': {
    title: 'Verificação de Serviços',
    explanation: 'Listando o status dos serviços do agente.',
    impact: 'Identifica se algum componente parou de funcionar.',
    actions: ['Reiniciar serviços problemáticos'],
    confidence: 'high',
    confidenceReason: 'Status lido diretamente do gerenciador de serviços'
  },
  'test_dns': {
    title: 'Teste de DNS',
    explanation: 'Verificando se o computador consegue resolver nomes de internet.',
    impact: 'Problemas de DNS impedem acesso a sites e serviços.',
    actions: ['Verificar configuração de DNS', 'Testar servidores alternativos'],
    confidence: 'medium',
    confidenceReason: 'Depende do servidor DNS configurado'
  },

  // Generic
  'unknown': {
    title: 'Problema Detectado',
    explanation: 'Um problema foi identificado mas não foi classificado.',
    impact: 'Requer investigação manual para determinar impacto.',
    actions: [
      'Verificar logs do agente',
      'Coletar diagnóstico completo'
    ],
    confidence: 'low',
    confidenceReason: 'Problema não classificado - requer investigação'
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

/**
 * Gets badge styling properties for a confidence level.
 */
export function getConfidenceBadge(confidence: ConfidenceLevel): {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
  className: string;
} {
  switch (confidence) {
    case 'high':
      return { 
        label: 'Alta confiança', 
        variant: 'default',
        className: 'bg-success/10 text-success border-success/20 hover:bg-success/20'
      };
    case 'medium':
      return { 
        label: 'Confiança média', 
        variant: 'secondary',
        className: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'
      };
    case 'low':
      return { 
        label: 'Baixa confiança', 
        variant: 'outline',
        className: 'bg-muted/50 text-muted-foreground border-border hover:bg-muted/70'
      };
  }
}
