/**
 * LABELS DE TAREFAS - LINGUAGEM HUMANA
 * =====================================
 * Regra: O usuário não precisa saber o que é um "job" ou "scan"
 * Ele só precisa entender o que vai acontecer no computador dele.
 */

// Mapeamento de tipos de tarefas para nomes amigáveis (LINGUAGEM HUMANA)
export const JOB_TYPE_LABELS: Record<string, string> = {
  // === Verificações de segurança ===
  scan: '📁 Verificar arquivos',
  light_vuln_scan: '🔍 Buscar falhas de segurança',
  collect_antivirus_status: '🛡️ Checar proteção antivírus',
  
  // === Atualizações ===
  update_agent: '🔄 Atualizar proteção',
  reinstall_agent: '🔧 Reinstalar proteção',
  
  // === Coleta de informações ===
  software_inventory_collect: '📦 Listar programas instalados',
  collect_web_activity: '🌐 Verificar sites acessados',
  collect_network_info: '🔌 Verificar conexão de rede',
  collect_dns_blocks: '📊 Ver sites bloqueados',
  report: '📊 Gerar relatório',
  
  // === Correções de segurança ===
  fix_firewall: '🔥 Corrigir firewall',
  sync_blocked_websites: '🚫 Atualizar lista de sites bloqueados',
  setup_dns_filter: '🛡️ Ativar filtro de navegação',
  remove_dns_filter: '🗑️ Remover filtro de navegação',
  
  // === Controle de processos ===
  kill_process: '⚠️ Fechar programa',
  stop_service: '⏹️ Pausar serviço',
  disable_service: '🚫 Desativar serviço',
  restart_service: '🔃 Reiniciar serviço',
  
  // === Testes ===
  integration_test_v3: '🧪 Teste de sistema',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: '⏳ Aguardando',
  delivered: '📤 Enviado',
  completed: '✅ Concluído',
  failed: '❌ Falhou',
  pending: '⏸️ Pendente',
  running: '⚙️ Executando',
};

// Descrições para tooltips (LINGUAGEM HUMANA)
export const JOB_STATUS_DESCRIPTIONS: Record<string, string> = {
  queued: 'A tarefa está na fila aguardando o computador ficar disponível',
  delivered: 'Enviado para o computador, aguardando confirmação',
  completed: 'Tarefa finalizada com sucesso',
  failed: 'Não foi possível completar a tarefa',
  pending: 'Tarefa criada, será processada em breve',
  running: 'A tarefa está sendo executada agora',
};

// Terminologia amigável para UI (LINGUAGEM HUMANA)
export const UI_TERMINOLOGY = {
  job: 'Verificação',
  jobs: 'Verificações',
  createJob: 'Nova Verificação',
  newJob: 'Nova Verificação',
  recentJobs: 'Verificações Recentes',
  pendingJobs: 'Verificações Pendentes',
  jobHistory: 'Histórico de Verificações',
  clearPendingJobs: 'Limpar Pendentes',
  agent: 'Computador',
  agents: 'Computadores',
  heartbeat: 'Status de Conexão',
  uptime: 'Tempo Online',
  tenant: 'Empresa',
};

// Funções helper
export const getJobTypeLabel = (type: string): string => 
  JOB_TYPE_LABELS[type] || type;

export const getJobStatusLabel = (status: string): string => 
  JOB_STATUS_LABELS[status] || status;

// Versão sem emoji para contextos específicos (LINGUAGEM HUMANA)
export const JOB_TYPE_LABELS_NO_EMOJI: Record<string, string> = {
  // === Verificações de segurança ===
  scan: 'Verificar arquivos',
  light_vuln_scan: 'Buscar falhas de segurança',
  collect_antivirus_status: 'Checar proteção antivírus',
  
  // === Atualizações ===
  update_agent: 'Atualizar proteção',
  reinstall_agent: 'Reinstalar proteção',
  
  // === Coleta de informações ===
  software_inventory_collect: 'Listar programas instalados',
  collect_web_activity: 'Verificar sites acessados',
  collect_network_info: 'Verificar conexão de rede',
  collect_dns_blocks: 'Ver sites bloqueados',
  report: 'Gerar relatório',
  
  // === Correções de segurança ===
  fix_firewall: 'Corrigir firewall',
  sync_blocked_websites: 'Atualizar lista de sites bloqueados',
  setup_dns_filter: 'Ativar filtro de navegação',
  remove_dns_filter: 'Remover filtro de navegação',
  
  // === Controle de processos ===
  kill_process: 'Fechar programa',
  stop_service: 'Pausar serviço',
  disable_service: 'Desativar serviço',
  restart_service: 'Reiniciar serviço',
  
  // === Testes ===
  integration_test_v3: 'Teste de sistema',
};

// Lista de processos críticos do sistema que NÃO podem ser encerrados
export const PROTECTED_PROCESSES: string[] = [
  'csrss.exe',
  'smss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'System',
  'dwm.exe',
  'explorer.exe',
  'taskmgr.exe',
  'RuntimeBroker.exe',
];

// Lista de serviços críticos que NÃO podem ser desabilitados
export const PROTECTED_SERVICES: string[] = [
  'eventlog',
  'PlugPlay',
  'Power',
  'RpcSs',
  'SENS',
  'Schedule',
  'Winmgmt',
  'wuauserv',
  'CryptSvc',
  'DcomLaunch',
  'Dhcp',
  'Dnscache',
  'LanmanServer',
  'LanmanWorkstation',
  'NlaSvc',
  'Netman',
  'WinDefend',
  'MpsSvc',
];

// Validar se processo pode ser encerrado
export const isProcessProtected = (processName: string): boolean => {
  const name = processName.toLowerCase();
  return PROTECTED_PROCESSES.some(p => p.toLowerCase() === name);
};

// Validar se serviço pode ser gerenciado
export const isServiceProtected = (serviceName: string): boolean => {
  const name = serviceName.toLowerCase();
  return PROTECTED_SERVICES.some(s => s.toLowerCase() === name);
};

export const getJobTypeLabelNoEmoji = (type: string): string => 
  JOB_TYPE_LABELS_NO_EMOJI[type] || type;
