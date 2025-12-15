// Mapeamento de tipos de tarefas para nomes amigáveis
export const JOB_TYPE_LABELS: Record<string, string> = {
  scan: '📁 Verificação de Arquivos',
  update_agent: '🔄 Atualização do Agente',
  report: '📊 Geração de Relatório',
  software_inventory_collect: '📦 Inventário de Software',
  collect_antivirus_status: '🛡️ Status do Antivírus',
  collect_web_activity: '🌐 Atividade Web',
  light_vuln_scan: '🔍 Scan de Vulnerabilidades',
  collect_network_info: '🔌 Diagnóstico de Rede',
  reinstall_agent: '🔧 Reinstalação do Agente',
  fix_firewall: '🔥 Correção de Firewall',
  restart_service: '🔃 Reiniciar Serviço',
  sync_blocked_websites: '🚫 Sincronização de Sites Bloqueados',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: '⏳ Na Fila',
  delivered: '📤 Enviado',
  completed: '✅ Concluído',
  failed: '❌ Falhou',
  pending: '⏸️ Aguardando',
};

// Terminologia amigável para UI
export const UI_TERMINOLOGY = {
  job: 'Tarefa',
  jobs: 'Tarefas',
  createJob: 'Criar Tarefa',
  newJob: 'Nova Tarefa',
  recentJobs: 'Tarefas Recentes',
  pendingJobs: 'Tarefas Pendentes',
  jobHistory: 'Histórico de Tarefas',
  clearPendingJobs: 'Limpar Pendentes',
  agent: 'Computador',
  agents: 'Computadores',
  heartbeat: 'Sinal de Vida',
  uptime: 'Tempo Online',
  tenant: 'Empresa',
};

// Funções helper
export const getJobTypeLabel = (type: string): string => 
  JOB_TYPE_LABELS[type] || type;

export const getJobStatusLabel = (status: string): string => 
  JOB_STATUS_LABELS[status] || status;

// Versão sem emoji para contextos específicos
export const JOB_TYPE_LABELS_NO_EMOJI: Record<string, string> = {
  scan: 'Verificação de Arquivos',
  update_agent: 'Atualização do Agente',
  report: 'Geração de Relatório',
  software_inventory_collect: 'Inventário de Software',
  collect_antivirus_status: 'Status do Antivírus',
  collect_web_activity: 'Atividade Web',
  light_vuln_scan: 'Scan de Vulnerabilidades',
  collect_network_info: 'Diagnóstico de Rede',
  reinstall_agent: 'Reinstalação do Agente',
  fix_firewall: 'Correção de Firewall',
  restart_service: 'Reiniciar Serviço',
  sync_blocked_websites: 'Sincronização de Sites Bloqueados',
};

export const getJobTypeLabelNoEmoji = (type: string): string => 
  JOB_TYPE_LABELS_NO_EMOJI[type] || type;
