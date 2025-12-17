// Friendly status translations for non-technical users

export const AGENT_STATUS_LABELS: Record<string, { label: string; description: string }> = {
  'active': { 
    label: 'Protegido ✓', 
    description: 'Computador online e monitorado' 
  },
  'inactive': { 
    label: 'Desativado', 
    description: 'Monitoramento pausado' 
  },
  'pending': { 
    label: 'Configurando...', 
    description: 'Aguardando primeira conexão' 
  },
  'offline': { 
    label: 'Desligado', 
    description: 'Computador está desligado ou sem internet' 
  },
  'online': { 
    label: 'Ligado ✓', 
    description: 'Computador conectado e funcionando' 
  }
};

export const ALERT_FRIENDLY_MESSAGES: Record<string, { title: string; description: string; action: string }> = {
  'high_cpu': {
    title: 'Computador lento',
    description: 'Muitos programas abertos ou processo consumindo muitos recursos',
    action: 'Feche programas que não está usando ou reinicie o computador'
  },
  'high_memory': {
    title: 'Memória cheia',
    description: 'A memória RAM está quase no limite',
    action: 'Feche algumas abas do navegador ou programas abertos'
  },
  'memory_warning': {
    title: 'Memória em uso alto',
    description: 'Uso de memória acima do normal',
    action: 'Considere fechar alguns programas'
  },
  'high_disk': {
    title: 'Disco quase cheio',
    description: 'Pouco espaço disponível no disco',
    action: 'Delete arquivos desnecessários ou mova para um HD externo'
  },
  'agent_offline': {
    title: 'Computador desligado',
    description: 'Não recebemos sinal deste computador há algum tempo',
    action: 'Verifique se o computador está ligado e conectado à internet'
  },
  'av_disabled': {
    title: 'Antivírus desativado',
    description: 'A proteção antivírus não está funcionando',
    action: 'Abra o Windows Defender e ative a proteção'
  },
  'av_outdated': {
    title: 'Antivírus desatualizado',
    description: 'As definições de vírus estão antigas',
    action: 'Atualize o Windows Defender nas configurações'
  },
  'vulnerability_critical': {
    title: 'Programa com falha grave',
    description: 'Um programa instalado tem uma vulnerabilidade conhecida',
    action: 'Atualize o programa ou contate o suporte'
  },
  'vulnerability_high': {
    title: 'Programa precisa de atualização',
    description: 'Uma atualização de segurança está disponível',
    action: 'Atualize o programa para a versão mais recente'
  },
  'suspicious_activity': {
    title: 'Atividade suspeita detectada',
    description: 'Comportamento incomum foi identificado',
    action: 'Entre em contato com o suporte para investigação'
  },
  'blocked_site': {
    title: 'Acesso bloqueado',
    description: 'Tentativa de acessar site não permitido',
    action: 'Este site está na lista de bloqueio da empresa'
  }
};

export const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  'critical': { label: 'Urgente', color: 'text-red-500' },
  'high': { label: 'Importante', color: 'text-orange-500' },
  'medium': { label: 'Moderado', color: 'text-yellow-500' },
  'low': { label: 'Baixo', color: 'text-blue-500' },
  'info': { label: 'Informativo', color: 'text-muted-foreground' }
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  'software_inventory_collect': 'Verificar programas instalados',
  'light_vuln_scan': 'Buscar vulnerabilidades',
  'collect_antivirus_status': 'Verificar antivírus',
  'collect_web_activity': 'Coletar histórico de navegação',
  'update_agent': 'Atualizar proteção',
  'sync_blocked_websites': 'Atualizar lista de sites bloqueados',
  'collect_network_info': 'Verificar conexões de rede'
};

export function getFriendlyAgentStatus(status: string, lastHeartbeat: string | null): { label: string; description: string } {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const isOnline = lastHeartbeat && new Date(lastHeartbeat) > fiveMinutesAgo;
  
  if (!isOnline && status === 'active') {
    return AGENT_STATUS_LABELS['offline'];
  }
  
  if (isOnline) {
    return AGENT_STATUS_LABELS['online'];
  }
  
  return AGENT_STATUS_LABELS[status] || { label: status, description: '' };
}

export function getFriendlyAlertMessage(alertType: string): { title: string; description: string; action: string } {
  return ALERT_FRIENDLY_MESSAGES[alertType] || {
    title: formatAlertType(alertType),
    description: 'Um alerta foi gerado pelo sistema',
    action: 'Entre em contato com o suporte se precisar de ajuda'
  };
}

function formatAlertType(alertType: string): string {
  return alertType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

export function getFriendlySeverity(severity: string): { label: string; color: string } {
  return SEVERITY_LABELS[severity] || SEVERITY_LABELS['info'];
}

export function getFriendlyJobType(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] || jobType;
}
