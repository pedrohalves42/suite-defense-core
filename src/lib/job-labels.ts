// Mapeamento de tipos de jobs para nomes amigáveis
export const JOB_TYPE_LABELS: Record<string, string> = {
  scan: '📁 Verificação de Arquivos',
  update: '🔄 Atualização do Agente',
  update_agent: '🔄 Atualização Automática',
  report: '📊 Geração de Relatório',
  config: '⚙️ Configuração',
  software_inventory_collect: '📦 Inventário de Software',
  collect_antivirus_status: '🛡️ Status do Antivírus',
  collect_web_activity: '🌐 Atividade Web',
  light_vuln_scan: '🔍 Scan de Vulnerabilidades',
  collect_network_info: '🔌 Diagnóstico de Rede',
  reinstall_agent: '🔧 Reinstalação do Agente',
  fix_firewall: '🔥 Correção de Firewall',
  restart_service: '🔃 Reiniciar Serviço',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: '⏳ Aguardando',
  delivered: '📤 Enviado',
  completed: '✅ Concluído',
  failed: '❌ Falhou',
  pending: '⏸️ Pendente',
};

// Funções helper
export const getJobTypeLabel = (type: string): string => 
  JOB_TYPE_LABELS[type] || type;

export const getJobStatusLabel = (status: string): string => 
  JOB_STATUS_LABELS[status] || status;

// Versão sem emoji para contextos específicos
export const JOB_TYPE_LABELS_NO_EMOJI: Record<string, string> = {
  scan: 'Verificação de Arquivos',
  update: 'Atualização do Agente',
  update_agent: 'Atualização Automática',
  report: 'Geração de Relatório',
  config: 'Configuração',
  software_inventory_collect: 'Inventário de Software',
  collect_antivirus_status: 'Status do Antivírus',
  collect_web_activity: 'Atividade Web',
  light_vuln_scan: 'Scan de Vulnerabilidades',
  collect_network_info: 'Diagnóstico de Rede',
  reinstall_agent: 'Reinstalação do Agente',
  fix_firewall: 'Correção de Firewall',
  restart_service: 'Reiniciar Serviço',
};

export const getJobTypeLabelNoEmoji = (type: string): string => 
  JOB_TYPE_LABELS_NO_EMOJI[type] || type;
