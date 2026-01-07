/**
 * TRADUTOR PARA LEIGOS - CyberShield
 * ===================================
 * 
 * Arquivo central de tradução de termos técnicos para linguagem simples.
 * Qualquer pessoa sem conhecimento técnico deve entender.
 * 
 * Princípio: Fale o efeito, não o mecanismo.
 */

// Mapeamento de termos técnicos para linguagem simples
export const TECH_TO_SIMPLE: Record<string, string> = {
  // Hardware e recursos
  'cpu': 'processador',
  'CPU': 'processador',
  'ram': 'memória',
  'RAM': 'memória',
  'memory': 'memória',
  'disk': 'armazenamento',
  'storage': 'armazenamento',
  'hard drive': 'disco',
  'SSD': 'disco',
  'HDD': 'disco',
  
  // Rede e conectividade
  'network': 'internet',
  'connection': 'conexão',
  'timeout': 'demorou demais',
  'connection refused': 'computador não respondeu',
  'connection reset': 'conexão foi interrompida',
  'DNS': 'endereço de internet',
  'firewall': 'proteção de rede',
  'proxy': 'servidor intermediário',
  'socket': 'conexão',
  'port': 'porta de comunicação',
  'HTTPS': 'conexão segura',
  'SSL': 'conexão segura',
  'certificate': 'certificado de segurança',
  'handshake': 'negociação de conexão',
  'latency': 'tempo de resposta',
  'bandwidth': 'velocidade de internet',
  
  // Segurança
  'malware': 'vírus',
  'virus': 'vírus',
  'trojan': 'vírus',
  'ransomware': 'vírus sequestrador',
  'vulnerability': 'falha de segurança',
  'patch': 'atualização de segurança',
  'exploit': 'brecha de segurança',
  'threat': 'ameaça',
  'quarantine': 'área de isolamento',
  'sandbox': 'ambiente de teste',
  
  // Autenticação
  'authentication': 'login',
  'authorization': 'permissão',
  'permission denied': 'sem permissão',
  'access denied': 'acesso negado',
  'unauthorized': 'não autorizado',
  'forbidden': 'não permitido',
  'token': 'credencial',
  'credentials': 'dados de acesso',
  'session': 'sessão de uso',
  'expired': 'expirou',
  
  // Erros e estados
  'error': 'erro',
  'exception': 'erro',
  'failure': 'falha',
  'null': 'vazio',
  'undefined': 'indefinido',
  'stack trace': 'detalhes do erro',
  'crash': 'travou',
  'hang': 'travou',
  'freeze': 'congelou',
  'deadlock': 'travamento',
  
  // Sistema
  'process': 'programa',
  'service': 'serviço',
  'daemon': 'serviço de fundo',
  'thread': 'tarefa',
  'task': 'tarefa',
  'queue': 'fila',
  'cache': 'memória temporária',
  'buffer': 'memória temporária',
  'log': 'registro',
  'registry': 'configurações do sistema',
  'driver': 'controlador de hardware',
  
  // Agente específico
  'agent': 'computador',
  'heartbeat': 'sinal de vida',
  'polling': 'verificação automática',
  'sync': 'sincronização',
  'deploy': 'instalação',
  'rollback': 'voltar versão anterior',
  'update': 'atualização',
  'upgrade': 'atualização',
  'downgrade': 'voltar versão anterior',
  
  // Estados do job
  'queued': 'aguardando',
  'pending': 'pendente',
  'running': 'executando',
  'completed': 'concluído',
  'failed': 'falhou',
  'delivered': 'enviado',
  'cancelled': 'cancelado',
  'stalled': 'travado',
  'offline': 'desconectado',
  'online': 'conectado',
  'healthy': 'funcionando bem',
  'unhealthy': 'com problemas',
  'degraded': 'funcionando parcialmente',
  'critical': 'crítico',
  'warning': 'atenção',
  'info': 'informação',
};

// Classes de falha para linguagem simples
export const FAILURE_CLASS_LABELS: Record<string, {
  title: string;
  explanation: string;
  userAction: string;
  icon?: string;
}> = {
  'AGENT_OFFLINE': {
    title: 'Computador Desligado',
    explanation: 'O computador estava desligado ou sem internet quando tentamos executar a tarefa.',
    userAction: 'Verifique se o computador está ligado e conectado à internet.',
    icon: '🔌'
  },
  'AGENT_STALLED': {
    title: 'Computador Travou',
    explanation: 'O programa de monitoramento parou de responder no meio da tarefa.',
    userAction: 'Pode ser necessário reiniciar o computador.',
    icon: '⏸️'
  },
  'AGENT_BUSY': {
    title: 'Computador Ocupado',
    explanation: 'O computador está executando muitas tarefas ao mesmo tempo.',
    userAction: 'Aguarde um momento e tente novamente.',
    icon: '⏳'
  },
  'NETWORK_ERROR': {
    title: 'Problema de Internet',
    explanation: 'A conexão de internet falhou durante a tarefa.',
    userAction: 'Verifique a conexão de rede do computador.',
    icon: '📶'
  },
  'TIMEOUT': {
    title: 'Tempo Esgotado',
    explanation: 'A tarefa demorou mais que o esperado e foi cancelada automaticamente.',
    userAction: 'O computador pode estar muito lento. Tente novamente mais tarde.',
    icon: '⏱️'
  },
  'PERMISSION_DENIED': {
    title: 'Sem Permissão',
    explanation: 'O programa não tem permissão para executar esta ação no computador.',
    userAction: 'Pode ser necessário reinstalar o agente com permissões de administrador.',
    icon: '🔒'
  },
  'RESOURCE_EXHAUSTED': {
    title: 'Recursos Insuficientes',
    explanation: 'O computador está sem memória ou espaço em disco.',
    userAction: 'Libere espaço no disco ou feche alguns programas.',
    icon: '💾'
  },
  'SCRIPT_ERROR': {
    title: 'Erro na Execução',
    explanation: 'Houve um erro ao executar o comando no computador.',
    userAction: 'Entre em contato com o suporte técnico.',
    icon: '⚠️'
  },
  'UNKNOWN': {
    title: 'Erro Desconhecido',
    explanation: 'Algo inesperado aconteceu e não conseguimos identificar o problema.',
    userAction: 'Tente novamente. Se persistir, contate o suporte.',
    icon: '❓'
  },
};

// Tipos de alerta para linguagem simples
export const ALERT_TYPE_LABELS: Record<string, {
  title: string;
  explanation: string;
  analogy: string;
  urgency: string;
  icon?: string;
}> = {
  'high_cpu': {
    title: 'Computador Muito Lento',
    explanation: 'O processador está trabalhando demais.',
    analogy: 'É como uma pessoa tentando fazer 10 tarefas ao mesmo tempo.',
    urgency: 'Verifique se há programas pesados rodando.',
    icon: '🔥'
  },
  'high_memory': {
    title: 'Memória Quase Cheia',
    explanation: 'O computador está usando quase toda a memória disponível.',
    analogy: 'É como uma mesa de trabalho muito bagunçada, sem espaço para novas coisas.',
    urgency: 'Feche programas que não está usando.',
    icon: '🧠'
  },
  'high_disk': {
    title: 'Disco Quase Cheio',
    explanation: 'O espaço de armazenamento está acabando.',
    analogy: 'É como um armário lotado - não cabe mais nada.',
    urgency: 'Apague arquivos antigos ou mova para outro lugar.',
    icon: '💽'
  },
  'critical_disk': {
    title: 'Disco Crítico - Urgente!',
    explanation: 'O disco está quase completamente cheio.',
    analogy: 'O armário transbordou - nada mais funciona direito.',
    urgency: 'Ação imediata necessária para evitar problemas graves.',
    icon: '🚨'
  },
  'no_heartbeat': {
    title: 'Computador Desconectado',
    explanation: 'Não recebemos notícias do computador há um tempo.',
    analogy: 'É como um amigo que parou de responder mensagens.',
    urgency: 'Verifique se o computador está ligado e com internet.',
    icon: '💔'
  },
  'antivirus_disabled': {
    title: 'Antivírus Desativado',
    explanation: 'A proteção contra vírus está desligada.',
    analogy: 'É como sair de casa com a porta destrancada.',
    urgency: 'Ative o antivírus para manter o computador protegido.',
    icon: '🛡️'
  },
  'outdated_software': {
    title: 'Programas Desatualizados',
    explanation: 'Alguns programas estão em versões antigas.',
    analogy: 'É como usar um mapa antigo - pode ter informações erradas.',
    urgency: 'Atualize os programas para evitar problemas de segurança.',
    icon: '📦'
  },
  'suspicious_activity': {
    title: 'Atividade Suspeita',
    explanation: 'Detectamos algo fora do normal no computador.',
    analogy: 'É como ouvir um barulho estranho em casa.',
    urgency: 'Verifique se alguém está usando o computador de forma indevida.',
    icon: '👁️'
  },
  'firewall_disabled': {
    title: 'Firewall Desativado',
    explanation: 'A proteção de rede está desligada.',
    analogy: 'É como deixar todas as janelas abertas - qualquer um pode entrar.',
    urgency: 'Ative o firewall para proteger o computador.',
    icon: '🔥'
  },
  'safe_mode': {
    title: 'Modo de Segurança Ativo',
    explanation: 'O agente entrou em modo de proteção após detectar problemas.',
    analogy: 'É como um carro que entra em modo econômico quando algo não está certo.',
    urgency: 'Pode ser necessário intervenção manual para voltar ao normal.',
    icon: '🔐'
  },
};

/**
 * Traduz um termo técnico para linguagem simples
 */
export function translateTerm(term: string): string {
  return TECH_TO_SIMPLE[term.toLowerCase()] || TECH_TO_SIMPLE[term] || term;
}

/**
 * Simplifica uma mensagem técnica completa
 * Substitui todos os termos técnicos encontrados
 */
export function simplifyMessage(technicalMessage: string): string {
  let simplified = technicalMessage;
  
  // Ordena por tamanho (maior primeiro) para evitar substituições parciais
  const sortedTerms = Object.entries(TECH_TO_SIMPLE)
    .sort(([a], [b]) => b.length - a.length);
  
  for (const [tech, simple] of sortedTerms) {
    const regex = new RegExp(`\\b${tech}\\b`, 'gi');
    simplified = simplified.replace(regex, simple);
  }
  
  return simplified;
}

/**
 * Obtém explicação amigável para uma classe de falha
 */
export function getFailureExplanation(failureClass: string) {
  return FAILURE_CLASS_LABELS[failureClass] || FAILURE_CLASS_LABELS['UNKNOWN'];
}

/**
 * Obtém explicação amigável para um tipo de alerta
 */
export function getAlertExplanation(alertType: string) {
  return ALERT_TYPE_LABELS[alertType] || {
    title: 'Alerta',
    explanation: 'Algo requer sua atenção.',
    analogy: '',
    urgency: 'Verifique os detalhes do alerta.',
    icon: '⚠️'
  };
}

/**
 * Formata uma mensagem de erro técnica para o usuário final
 */
export function formatErrorForUser(error: Error | string | unknown): {
  title: string;
  description: string;
  suggestion?: string;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const simplified = simplifyMessage(errorMessage);
  
  // Detecta padrões comuns
  if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
    return {
      title: 'Problema de conexão',
      description: 'Não conseguimos nos conectar ao servidor.',
      suggestion: 'Verifique sua internet e tente novamente.'
    };
  }
  
  if (errorMessage.toLowerCase().includes('timeout')) {
    return {
      title: 'Tempo esgotado',
      description: 'A operação demorou mais que o esperado.',
      suggestion: 'Tente novamente em alguns minutos.'
    };
  }
  
  if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
    return {
      title: 'Sessão expirada',
      description: 'Você foi desconectado.',
      suggestion: 'Faça login novamente para continuar.'
    };
  }
  
  if (errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden')) {
    return {
      title: 'Sem permissão',
      description: 'Você não pode fazer isso.',
      suggestion: 'Verifique suas permissões ou contate um administrador.'
    };
  }
  
  if (errorMessage.includes('500') || errorMessage.toLowerCase().includes('internal server')) {
    return {
      title: 'Erro interno',
      description: 'Algo deu errado do nosso lado.',
      suggestion: 'Estamos verificando. Tente novamente em breve.'
    };
  }
  
  return {
    title: 'Algo deu errado',
    description: simplified,
    suggestion: 'Tente novamente. Se persistir, contate o suporte.'
  };
}

/**
 * Converte status técnico para mensagem amigável
 */
export function humanizeStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': '⏸️ Pendente',
    'queued': '⏳ Na fila',
    'running': '⚙️ Executando',
    'delivered': '📤 Enviado',
    'completed': '✅ Pronto',
    'failed': '❌ Não deu certo',
    'cancelled': '🚫 Cancelado',
    'timeout': '⏱️ Tempo esgotado',
    'offline': '📴 Desconectado',
    'online': '🟢 Conectado',
    'healthy': '💚 Tudo certo',
    'unhealthy': '🔴 Com problema',
    'degraded': '🟡 Parcialmente ok',
    'warning': '⚠️ Atenção',
    'critical': '🚨 Urgente',
  };
  
  return statusMap[status.toLowerCase()] || status;
}
