export interface EducationalMoment {
  title: string;
  explanation: string;
  why_it_matters: string;
  what_to_do_next?: string;
  learn_more_url?: string;
}

/**
 * Educational content for each insight type
 * Helps users understand security concepts while the system protects them
 */
export const EDUCATIONAL_MOMENTS: Record<string, EducationalMoment> = {
  // Antivirus related
  antivirus_disabled: {
    title: 'Antivírus desativado',
    explanation: 'O antivírus é sua primeira linha de defesa contra malwares, vírus e outras ameaças. Quando desativado, seu dispositivo fica vulnerável a ataques.',
    why_it_matters: 'Sem proteção ativa, malwares podem se instalar silenciosamente e roubar dados, criptografar arquivos ou usar seu computador para atacar outros.',
    what_to_do_next: 'Mantenha sempre o antivírus ativo e atualizado. Configure para iniciar automaticamente com o sistema.',
  },

  antivirus_outdated: {
    title: 'Antivírus desatualizado',
    explanation: 'Novas ameaças surgem diariamente. Um antivírus desatualizado não reconhece malwares recentes.',
    why_it_matters: 'Atacantes frequentemente usam ameaças recém-criadas justamente para escapar de proteções antigas.',
    what_to_do_next: 'Ative as atualizações automáticas do antivírus para garantir proteção contra as ameaças mais recentes.',
  },

  // DNS and network threats
  dns_malicious_activity: {
    title: 'Tentativas de comunicação maliciosa',
    explanation: 'Malwares modernos tentam se comunicar com servidores externos (chamados de C2 ou Command & Control) para receber comandos ou enviar dados roubados.',
    why_it_matters: 'Mesmo que o ataque inicial tenha falhado, tentativas de comunicação maliciosa indicam que o dispositivo pode estar comprometido.',
    what_to_do_next: 'Verifique softwares instalados recentemente. Considere executar uma varredura completa do sistema.',
    learn_more_url: '/docs/security/dns-threats',
  },

  // Vulnerabilities
  vulnerability_critical: {
    title: 'Vulnerabilidade crítica detectada',
    explanation: 'Essa falha de segurança já é conhecida publicamente e possui exploits (código de ataque) disponíveis na internet.',
    why_it_matters: 'Atacantes automatizam a exploração dessas falhas conhecidas. É uma corrida contra o tempo para aplicar a correção.',
    what_to_do_next: 'Aplique a atualização de segurança o mais rápido possível. Manter atualizações automáticas reduz drasticamente esse risco.',
    learn_more_url: '/docs/security/vulnerabilities',
  },

  vulnerability_high: {
    title: 'Vulnerabilidade de alto risco',
    explanation: 'Foi identificada uma falha de segurança significativa que pode ser explorada por atacantes.',
    why_it_matters: 'Vulnerabilidades não corrigidas são a porta de entrada mais comum para ataques bem-sucedidos.',
    what_to_do_next: 'Planeje a aplicação do patch em até 72 horas. Priorize sistemas expostos à internet.',
  },

  // Software and processes
  p2p_software_detected: {
    title: 'Software de compartilhamento P2P detectado',
    explanation: 'Programas de torrent e P2P podem expor sua rede a riscos, pois abrem portas e compartilham arquivos com desconhecidos.',
    why_it_matters: 'Além de riscos legais, esses softwares são frequentemente usados para distribuir malwares disfarçados de arquivos legítimos.',
    what_to_do_next: 'Avalie se o uso é autorizado pela política da empresa. Considere alternativas mais seguras para compartilhamento de arquivos.',
  },

  process_anomaly: {
    title: 'Processo suspeito em execução',
    explanation: 'O sistema detectou um processo com comportamento anormal - pode ser consumo excessivo de recursos, tentativa de esconder-se, ou comunicação suspeita.',
    why_it_matters: 'Processos maliciosos frequentemente tentam se disfarçar de programas legítimos ou executar em segundo plano.',
    what_to_do_next: 'Investigue a origem do processo. Se não for reconhecido, considere encerrá-lo e executar uma varredura.',
  },

  // Agent and system health
  agent_offline_suspicious: {
    title: 'Agente offline de forma suspeita',
    explanation: 'O agente de monitoramento parou de se comunicar de forma inesperada, o que pode indicar manipulação maliciosa.',
    why_it_matters: 'Atacantes frequentemente tentam desabilitar ferramentas de segurança como primeiro passo de um ataque.',
    what_to_do_next: 'Verifique se o dispositivo está ligado e conectado. Se estiver, investigue se algo desativou o agente.',
  },

  safe_mode_prolonged: {
    title: 'Safe Mode ativo por tempo prolongado',
    explanation: 'O agente entrou em modo de segurança e não conseguiu retornar ao modo normal. Isso pode indicar problemas de conectividade ou configuração.',
    why_it_matters: 'No Safe Mode, algumas funcionalidades de proteção podem estar limitadas.',
    what_to_do_next: 'Verifique a conectividade do dispositivo e considere reiniciar o agente.',
  },

  // Jobs and automation
  job_failed_recurring: {
    title: 'Falhas recorrentes em tarefas automatizadas',
    explanation: 'Uma tarefa de manutenção ou segurança está falhando repetidamente, o que pode deixar lacunas na proteção.',
    why_it_matters: 'Tarefas como varreduras de vulnerabilidades ou coleta de inventário são essenciais para manter a visibilidade do ambiente.',
    what_to_do_next: 'Investigue os logs de erro para identificar a causa. Pode ser problema de permissão, conectividade ou configuração.',
  },

  anomaly_stuck_jobs: {
    title: 'Tarefas travadas no sistema',
    explanation: 'Algumas tarefas não estão sendo concluídas, possivelmente devido a problemas de comunicação ou sobrecarga.',
    why_it_matters: 'Tarefas travadas podem indicar problemas maiores de infraestrutura ou ataques de negação de serviço.',
    what_to_do_next: 'O sistema pode limpar automaticamente tarefas travadas. Monitore se o problema persiste.',
  },

  // Disk and resources
  disk_full_critical: {
    title: 'Disco quase cheio',
    explanation: 'O disco do sistema está próximo da capacidade máxima, o que pode causar falhas em logs, atualizações e operações normais.',
    why_it_matters: 'Sistemas sem espaço em disco podem parar de registrar eventos de segurança, criando pontos cegos na proteção.',
    what_to_do_next: 'Libere espaço removendo arquivos desnecessários ou expandindo o armazenamento.',
  },

  // Default fallback
  unknown: {
    title: 'Evento de segurança detectado',
    explanation: 'O sistema identificou uma situação que requer atenção.',
    why_it_matters: 'Manter-se informado sobre eventos de segurança ajuda a prevenir problemas maiores.',
    what_to_do_next: 'Revise os detalhes do evento e tome ação conforme recomendado.',
  },
};

/**
 * Get educational content for an insight type
 */
export function getEducationalMoment(insightType: string): EducationalMoment {
  return EDUCATIONAL_MOMENTS[insightType] || EDUCATIONAL_MOMENTS.unknown;
}

/**
 * Check if educational content exists for an insight type
 */
export function hasEducationalContent(insightType: string): boolean {
  return insightType in EDUCATIONAL_MOMENTS;
}
