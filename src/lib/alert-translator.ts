/**
 * Sistema de tradução de alertas técnicos para linguagem de negócio
 * Fase 2 P1: Humanização de alertas
 */

export interface TranslatedAlert {
  title: string;
  description: string;
  businessImpact: string;
  recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  icon: string;
}

interface AlertTranslation {
  title: string;
  description: string;
  businessImpact: string;
  recommendation: string;
  severity: TranslatedAlert['severity'];
  icon: string;
}

const ALERT_TRANSLATIONS: Record<string, AlertTranslation> = {
  // CPU Alerts
  high_cpu: {
    title: 'Computador Sobrecarregado',
    description: 'O processador está trabalhando no limite, o que pode causar lentidão e travamentos.',
    businessImpact: 'Funcionários podem ter dificuldade para trabalhar, causando perda de produtividade.',
    recommendation: 'Feche programas que não está usando. Se persistir, pode ser um vírus ou programa defeituoso.',
    severity: 'high',
    icon: '🔥'
  },
  cpu_spike: {
    title: 'Pico de Uso do Processador',
    description: 'O computador teve um aumento repentino de uso, possivelmente por um programa pesado.',
    businessImpact: 'Pode indicar que um programa está consumindo recursos excessivos.',
    recommendation: 'Verifique quais programas estão abertos e feche os desnecessários.',
    severity: 'medium',
    icon: '⚡'
  },

  // Memory Alerts
  high_memory: {
    title: 'Memória Quase Cheia',
    description: 'O computador está usando quase toda a memória disponível.',
    businessImpact: 'O computador pode ficar muito lento ou travar, afetando o trabalho.',
    recommendation: 'Feche abas do navegador e programas que não está usando. Considere reiniciar o computador.',
    severity: 'high',
    icon: '💾'
  },
  memory_leak: {
    title: 'Vazamento de Memória',
    description: 'Um programa está consumindo memória continuamente sem liberar.',
    businessImpact: 'O computador ficará cada vez mais lento até travar.',
    recommendation: 'Identifique e reinicie o programa problemático. Se persistir, pode precisar de atualização.',
    severity: 'high',
    icon: '🚿'
  },

  // Disk Alerts
  high_disk: {
    title: 'Disco Quase Cheio',
    description: 'O espaço de armazenamento está acabando.',
    businessImpact: 'Não será possível salvar arquivos novos e o computador pode ficar instável.',
    recommendation: 'Delete arquivos desnecessários, esvazie a lixeira e mova arquivos antigos para backup.',
    severity: 'critical',
    icon: '💿'
  },
  disk_io_high: {
    title: 'Disco Muito Ocupado',
    description: 'O disco está lendo/gravando dados intensamente.',
    businessImpact: 'Programas podem demorar para abrir e salvar arquivos.',
    recommendation: 'Aguarde a conclusão das operações ou verifique se há atualizações em andamento.',
    severity: 'medium',
    icon: '📀'
  },

  // Network Alerts
  network_offline: {
    title: 'Sem Conexão de Internet',
    description: 'O computador não está conseguindo se conectar à internet.',
    businessImpact: 'Não é possível acessar email, sistemas online ou salvar na nuvem.',
    recommendation: 'Verifique o cabo de rede ou WiFi. Tente reiniciar o roteador.',
    severity: 'critical',
    icon: '🌐'
  },
  network_slow: {
    title: 'Internet Lenta',
    description: 'A velocidade da conexão está abaixo do normal.',
    businessImpact: 'Downloads, uploads e sistemas online vão funcionar devagar.',
    recommendation: 'Verifique se alguém está fazendo download grande ou se há muitos dispositivos na rede.',
    severity: 'medium',
    icon: '🐌'
  },

  // Security Alerts
  threat_detected: {
    title: 'Ameaça de Segurança Detectada',
    description: 'O antivírus encontrou um arquivo ou programa suspeito.',
    businessImpact: 'O computador pode estar em risco de infecção por vírus ou malware.',
    recommendation: 'Não abra o arquivo suspeito. Deixe o antivírus remover a ameaça automaticamente.',
    severity: 'critical',
    icon: '🦠'
  },
  antivirus_outdated: {
    title: 'Antivírus Desatualizado',
    description: 'O antivírus não está recebendo atualizações de proteção.',
    businessImpact: 'O computador fica vulnerável a novos vírus e ameaças.',
    recommendation: 'Atualize o antivírus imediatamente. Se não funcionar, entre em contato com TI.',
    severity: 'high',
    icon: '🛡️'
  },
  antivirus_disabled: {
    title: 'Antivírus Desativado',
    description: 'A proteção antivírus não está funcionando.',
    businessImpact: 'O computador está completamente desprotegido contra ameaças.',
    recommendation: 'Ative o antivírus imediatamente. Este é um risco crítico de segurança.',
    severity: 'critical',
    icon: '⚠️'
  },
  firewall_disabled: {
    title: 'Firewall Desativado',
    description: 'O firewall do Windows não está protegendo o computador.',
    businessImpact: 'Hackers podem ter acesso mais fácil ao computador.',
    recommendation: 'Ative o firewall nas configurações do Windows imediatamente.',
    severity: 'high',
    icon: '🧱'
  },
  suspicious_login: {
    title: 'Tentativa de Login Suspeita',
    description: 'Alguém tentou acessar o sistema de um local ou horário incomum.',
    businessImpact: 'Pode indicar tentativa de invasão ou uso não autorizado.',
    recommendation: 'Verifique se foi você ou alguém autorizado. Considere trocar a senha.',
    severity: 'high',
    icon: '🔐'
  },

  // System Alerts
  agent_offline: {
    title: 'Computador Fora do Ar',
    description: 'O computador não está enviando informações de monitoramento.',
    businessImpact: 'Não é possível monitorar a segurança e saúde deste computador.',
    recommendation: 'Verifique se o computador está ligado e conectado à internet.',
    severity: 'medium',
    icon: '💤'
  },
  reboot_required: {
    title: 'Reinicialização Necessária',
    description: 'O computador precisa ser reiniciado para aplicar atualizações.',
    businessImpact: 'Algumas correções de segurança podem não estar ativas.',
    recommendation: 'Salve seu trabalho e reinicie o computador quando possível.',
    severity: 'low',
    icon: '🔄'
  },
  software_vulnerable: {
    title: 'Programa com Falha de Segurança',
    description: 'Um programa instalado tem uma vulnerabilidade conhecida.',
    businessImpact: 'Hackers podem explorar essa falha para atacar o computador.',
    recommendation: 'Atualize o programa para a versão mais recente.',
    severity: 'high',
    icon: '🔓'
  },

  // Job Alerts
  job_failed: {
    title: 'Tarefa de Segurança Falhou',
    description: 'Uma verificação de segurança não foi concluída com sucesso.',
    businessImpact: 'Informações de segurança podem estar desatualizadas.',
    recommendation: 'O sistema tentará novamente automaticamente. Se persistir, contate suporte.',
    severity: 'medium',
    icon: '❌'
  },
  job_stuck: {
    title: 'Tarefa Travada',
    description: 'Uma verificação está demorando mais que o esperado.',
    businessImpact: 'Pode haver problemas de comunicação com o computador.',
    recommendation: 'Verifique a conexão do computador. Pode ser necessário reiniciar.',
    severity: 'medium',
    icon: '⏳'
  },
};

/**
 * Traduz um alerta técnico para linguagem de negócio
 */
export function translateAlert(alertType: string, context?: Record<string, any>): TranslatedAlert {
  const translation = ALERT_TRANSLATIONS[alertType];
  
  if (translation) {
    let description = translation.description;
    let recommendation = translation.recommendation;
    
    // Substituir contexto se fornecido
    if (context) {
      if (context.value !== undefined) {
        description = description.replace('{value}', String(context.value));
      }
      if (context.threshold !== undefined) {
        description = description.replace('{threshold}', String(context.threshold));
      }
      if (context.agentName) {
        description = `No computador "${context.agentName}": ${description}`;
      }
    }
    
    return {
      ...translation,
      description,
      recommendation,
    };
  }
  
  // Fallback para alertas desconhecidos
  return {
    title: formatAlertType(alertType),
    description: `Foi detectado um alerta do tipo "${alertType}".`,
    businessImpact: 'Pode afetar o funcionamento normal do computador.',
    recommendation: 'Entre em contato com o suporte técnico para mais informações.',
    severity: 'info',
    icon: 'ℹ️'
  };
}

/**
 * Formata tipo de alerta técnico em texto legível
 */
function formatAlertType(alertType: string): string {
  return alertType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Obtém cor CSS baseada na severidade
 */
export function getSeverityColor(severity: TranslatedAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300';
  }
}

/**
 * Obtém label de severidade em português
 */
export function getSeverityLabel(severity: TranslatedAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'Crítico';
    case 'high':
      return 'Alto';
    case 'medium':
      return 'Médio';
    case 'low':
      return 'Baixo';
    default:
      return 'Informativo';
  }
}

/**
 * Traduz termos técnicos comuns para linguagem simples
 */
export const TECH_TERMS_DICTIONARY: Record<string, { term: string; explanation: string }> = {
  'CPU': {
    term: 'Processador',
    explanation: 'O "cérebro" do computador que executa todos os programas'
  },
  'RAM': {
    term: 'Memória',
    explanation: 'Onde o computador guarda informações temporárias enquanto trabalha'
  },
  'Disk': {
    term: 'Armazenamento',
    explanation: 'Onde seus arquivos ficam salvos permanentemente'
  },
  'Firewall': {
    term: 'Proteção de Rede',
    explanation: 'Uma barreira que bloqueia acessos não autorizados da internet'
  },
  'Malware': {
    term: 'Programa Malicioso',
    explanation: 'Software criado para danificar ou invadir computadores'
  },
  'Vulnerability': {
    term: 'Falha de Segurança',
    explanation: 'Uma brecha que hackers podem usar para atacar'
  },
  'Patch': {
    term: 'Correção',
    explanation: 'Uma atualização que conserta problemas de segurança'
  },
  'Endpoint': {
    term: 'Computador',
    explanation: 'Qualquer dispositivo conectado à rede (PC, notebook, etc)'
  },
  'Heartbeat': {
    term: 'Sinal de Vida',
    explanation: 'Confirmação periódica de que o computador está online e funcionando'
  },
  'Agent': {
    term: 'Programa de Monitoramento',
    explanation: 'Software instalado que coleta informações de segurança'
  },
  'CVE': {
    term: 'Vulnerabilidade Catalogada',
    explanation: 'Uma falha de segurança conhecida e registrada mundialmente'
  },
  'RLS': {
    term: 'Controle de Acesso',
    explanation: 'Sistema que garante que cada usuário só veja seus próprios dados'
  },
};

/**
 * Traduz um termo técnico se existir no dicionário
 */
export function translateTechTerm(term: string): { translated: string; explanation: string } | null {
  const entry = TECH_TERMS_DICTIONARY[term];
  if (entry) {
    return { translated: entry.term, explanation: entry.explanation };
  }
  return null;
}
