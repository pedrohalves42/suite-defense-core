import { AlertTriangle, Shield, Wifi, WifiOff, Bug, Lock, Bell, Zap, FileText, Activity, Brain, Eye, TrendingUp, AlertCircle, Cpu, HardDrive, MemoryStick, Ban } from 'lucide-react';

export interface ActionCopy {
  title: string;
  description: string;
  cta: string;
  ctaTooltip?: string;
  impact: string;
  icon: typeof AlertTriangle;
  whyUrgentTemplate?: string;
  suggestedNextSteps?: string[];
}

// Templates for dynamic content generation
export interface DynamicContent {
  title: string;
  description: string;
  cta: string;
  whyUrgent?: string;
}

// Human-readable copy for each trigger type
export const ACTION_COPY_MAP: Record<string, ActionCopy> = {
  vulnerability_critical: {
    title: 'Falha crítica que pode permitir invasão',
    description: 'Encontramos uma falha grave com exploit público disponível. Se explorada, um invasor pode assumir o controle da máquina.',
    impact: 'Risco alto de comprometimento total do sistema.',
    cta: 'Corrigir agora',
    ctaTooltip: 'Aplicar patch de segurança automaticamente para corrigir a vulnerabilidade',
    icon: Bug,
    whyUrgentTemplate: 'Vulnerabilidades críticas são os alvos preferidos de atacantes. Cada hora sem correção aumenta exponencialmente o risco.',
    suggestedNextSteps: ['Isolar máquina se não puder corrigir imediatamente', 'Verificar se houve exploração'],
  },
  software_risk_detected: {
    title: 'Software de alto risco detectado',
    description: 'Este computador possui um software classificado como alto risco que pode comprometer a segurança.',
    impact: 'Pode permitir acesso externo sem supervisão.',
    cta: 'Revisar software',
    ctaTooltip: 'Analisar o software detectado e decidir se deve ser removido ou bloqueado',
    icon: Shield,
    whyUrgentTemplate: 'Softwares de alto risco frequentemente contêm backdoors ou funcionalidades de acesso remoto não autorizadas.',
  },
  agent_offline: {
    title: 'Computador offline de forma inesperada',
    description: 'Este computador parou de responder sem desligamento normal registrado.',
    impact: 'Pode indicar falha grave, desligamento forçado ou tentativa de evasão.',
    cta: 'Analisar situação',
    ctaTooltip: 'Investigar o motivo do computador estar offline e tomar ação se necessário',
    icon: WifiOff,
    whyUrgentTemplate: 'Desligamentos inesperados podem indicar tentativa de esconder atividade maliciosa ou falha crítica de hardware.',
  },
  agent_offline_suspicious: {
    title: 'Computador offline com comportamento suspeito',
    description: 'Este computador ficou offline sem desligamento esperado e possui histórico recente de alertas.',
    impact: 'Forte indício de problema ou tentativa de evasão.',
    cta: 'Investigar agora',
    ctaTooltip: 'Iniciar investigação imediata dado o histórico de alertas',
    icon: WifiOff,
    whyUrgentTemplate: 'A combinação de alertas recentes + offline inesperado é um padrão comum de evasão de detecção.',
  },
  multiple_malicious_access: {
    title: 'Tentativas DNS maliciosas recorrentes',
    description: 'Foram detectadas múltiplas tentativas de acesso a domínios conhecidos por distribuir malware.',
    impact: 'Forte indício de infecção ativa ou comportamento malicioso.',
    cta: 'Bloquear automaticamente',
    ctaTooltip: 'Bloquear todas as conexões para os domínios maliciosos identificados',
    icon: Wifi,
    whyUrgentTemplate: 'Múltiplas tentativas indicam malware ativo tentando se comunicar com servidor de comando e controle.',
  },
  suspicious_process: {
    title: 'Processo incomum em execução',
    description: 'Um programa que não faz parte do comportamento normal deste computador está rodando no momento.',
    impact: 'Pode ser legítimo, mas também pode indicar execução não autorizada.',
    cta: 'Encerrar processo',
    ctaTooltip: 'Encerrar o processo suspeito e bloquear sua execução futura',
    icon: Activity,
    whyUrgentTemplate: 'Processos desconhecidos podem ser malware, ransomware ou ferramentas de ataque em execução.',
  },
  safe_mode_detected: {
    title: 'Proteções limitadas por segurança preventiva',
    description: 'Este computador entrou em modo de segurança após falhas anteriores e ainda não retornou ao modo normal.',
    impact: 'Algumas proteções automáticas estão temporariamente desativadas.',
    cta: 'Reativar proteções',
    ctaTooltip: 'Restaurar o funcionamento normal do agente com todas as proteções ativas',
    icon: Lock,
    whyUrgentTemplate: 'Com proteções limitadas, o sistema está mais vulnerável a ataques e pode não detectar ameaças.',
  },
  manual: {
    title: 'Ação manual pendente',
    description: 'Uma ação foi criada manualmente e aguarda execução.',
    impact: 'Requer atenção do administrador.',
    cta: 'Executar ação',
    ctaTooltip: 'Executar a ação manual conforme solicitado',
    icon: Zap,
  },
  // AI Insight types
  vulnerability: {
    title: 'Vulnerabilidade detectada pela IA',
    description: 'Nossa análise automática identificou uma falha de segurança que requer atenção.',
    impact: 'Risco de exploração se não corrigido.',
    cta: 'Ver recomendação',
    ctaTooltip: 'Visualizar a análise completa e recomendação de correção da IA',
    icon: Brain,
  },
  anomaly: {
    title: 'Padrão incomum identificado',
    description: 'Este computador apresentou um comportamento diferente do habitual.',
    impact: 'Vamos verificar para garantir que está tudo bem.',
    cta: 'Verificar agora',
    ctaTooltip: 'Ver detalhes completos deste computador para análise',
    icon: Eye,
  },
  anomaly_detection: {
    title: 'Comportamento incomum detectado',
    description: 'Este computador apresentou um padrão diferente do habitual.',
    impact: 'Vale a pena verificar para garantir que está tudo funcionando.',
    cta: 'Verificar agora',
    ctaTooltip: 'Ver detalhes completos para entender o que aconteceu',
    icon: Eye,
    whyUrgentTemplate: 'Mudanças de padrão merecem atenção, mas podem ter causa simples.',
  },
  compliance: {
    title: 'Problema de conformidade',
    description: 'Configuração ou comportamento fora dos padrões de segurança esperados.',
    impact: 'Pode afetar auditorias e compliance.',
    cta: 'Corrigir',
    ctaTooltip: 'Aplicar configuração correta para atender aos padrões de conformidade',
    icon: FileText,
  },
  performance: {
    title: 'Este computador está mais lento que o normal',
    description: 'Identificamos que o desempenho está abaixo do esperado.',
    impact: 'Pode afetar a produtividade do usuário.',
    cta: 'Ver detalhes',
    ctaTooltip: 'Identificar o que está causando a lentidão',
    icon: TrendingUp,
    whyUrgentTemplate: 'Vamos identificar a causa para resolver rapidamente.',
  },
  security_posture: {
    title: 'Configuração de segurança pode ser melhorada',
    description: 'Encontramos ajustes que podem deixar este computador mais protegido.',
    impact: 'Recomendamos aplicar as melhorias sugeridas.',
    cta: 'Ver sugestões',
    ctaTooltip: 'Ver as melhorias recomendadas de segurança',
    icon: Shield,
  },
  threat_intel: {
    title: 'Atividade suspeita identificada',
    description: 'Detectamos um comportamento que pode indicar risco.',
    impact: 'Recomendamos verificar para garantir a segurança.',
    cta: 'Verificar',
    ctaTooltip: 'Analisar o que foi detectado',
    icon: AlertCircle,
    whyUrgentTemplate: 'Atividades suspeitas merecem atenção imediata.',
  },
  // System resource types
  high_cpu_usage: {
    title: 'CPU em uso excessivo',
    description: 'O processador está sob carga elevada por período prolongado.',
    impact: 'Pode indicar mineração de criptomoedas, malware ou processo travado.',
    cta: 'Identificar causa',
    ctaTooltip: 'Investigar quais processos estão consumindo CPU excessiva',
    icon: Cpu,
    whyUrgentTemplate: 'CPU elevada por longo período pode indicar cryptominer ou malware consumindo recursos do sistema.',
  },
  high_memory_usage: {
    title: 'Memória em uso excessivo',
    description: 'A memória RAM está quase totalmente ocupada.',
    impact: 'Sistema pode travar ou ficar lento.',
    cta: 'Liberar memória',
    ctaTooltip: 'Identificar e encerrar processos consumindo memória excessiva',
    icon: MemoryStick,
  },
  high_disk_usage: {
    title: 'Disco quase cheio',
    description: 'O espaço em disco está criticamente baixo.',
    impact: 'Sistema pode parar de funcionar ou perder dados.',
    cta: 'Limpar espaço',
    ctaTooltip: 'Remover arquivos temporários e liberar espaço em disco',
    icon: HardDrive,
    whyUrgentTemplate: 'Disco cheio pode causar falhas de sistema, perda de logs de segurança e impedir atualizações.',
  },
  // Protection types
  antivirus_disabled: {
    title: 'Antivírus desativado',
    description: 'A proteção antivírus foi desabilitada neste computador.',
    impact: 'Sistema completamente exposto a malware.',
    cta: 'Reativar proteção',
    ctaTooltip: 'Reativar o antivírus imediatamente para restaurar proteção',
    icon: Shield,
    whyUrgentTemplate: 'Sem antivírus, qualquer malware pode infectar o sistema sem detecção.',
  },
  antivirus_outdated: {
    title: 'Definições de vírus desatualizadas',
    description: 'As definições de vírus estão antigas e podem não detectar ameaças recentes.',
    impact: 'Proteção reduzida contra novas ameaças.',
    cta: 'Atualizar definições',
    ctaTooltip: 'Forçar atualização das definições de vírus',
    icon: Shield,
  },
  firewall_disabled: {
    title: 'Firewall desativado',
    description: 'O firewall do Windows está desabilitado.',
    impact: 'Sistema exposto a conexões não autorizadas.',
    cta: 'Reativar firewall',
    ctaTooltip: 'Reativar o firewall para bloquear conexões não autorizadas',
    icon: Ban,
    whyUrgentTemplate: 'Sem firewall, qualquer conexão de rede é permitida, incluindo de atacantes.',
  },
};

// Default copy for unknown trigger types
export const DEFAULT_ACTION_COPY: ActionCopy = {
  title: 'Ação pendente',
  description: 'Uma ação foi detectada e aguarda sua decisão.',
  impact: 'Requer análise.',
  cta: 'Ver detalhes',
  ctaTooltip: 'Analisar os detalhes desta ação para tomar uma decisão',
  icon: AlertTriangle,
};

// Get copy for a trigger type, with fallback
export function getActionCopy(triggerType: string): ActionCopy {
  return ACTION_COPY_MAP[triggerType] || DEFAULT_ACTION_COPY;
}

// Generate dynamic content based on context
export function generateDynamicContent(
  triggerType: string, 
  context: any | null | undefined,
  agentName?: string | null,
  hostname?: string | null
): DynamicContent {
  const baseCopy = getActionCopy(triggerType);
  const agent = agentName || hostname || 'Sistema';
  const ctx = context || {};
  
  // Build dynamic title based on trigger type and context
  let title = baseCopy.title;
  let description = baseCopy.description;
  let cta = baseCopy.cta;
  let whyUrgent = baseCopy.whyUrgentTemplate || baseCopy.impact;

  switch (triggerType) {
    case 'high_cpu_usage':
      const cpuPercent = typeof ctx.cpu_percent === 'number' ? Math.round(ctx.cpu_percent) : null;
      const cpuDuration = ctx.duration || ctx.hours_offline;
      if (cpuPercent) {
        title = `CPU em ${cpuPercent}% em ${agent}`;
        description = cpuDuration 
          ? `O processador está em ${cpuPercent}% há ${cpuDuration}. Isso pode indicar processo malicioso, mineração ou tarefa travada.`
          : `O processador está em ${cpuPercent}%, bem acima do normal.`;
      }
      if (ctx.process_name) {
        description += ` Processo principal: ${ctx.process_name}`;
      }
      break;

    case 'high_memory_usage':
      const memPercent = typeof ctx.memory_percent === 'number' ? Math.round(ctx.memory_percent) : null;
      if (memPercent) {
        title = `Memória em ${memPercent}% em ${agent}`;
        description = `A memória está em ${memPercent}%, o que pode causar lentidão ou travamento.`;
      }
      break;

    case 'high_disk_usage':
      const diskPercent = typeof ctx.disk_percent === 'number' ? Math.round(ctx.disk_percent) : null;
      const diskFreeGb = typeof ctx.disk_free_gb === 'number' ? ctx.disk_free_gb.toFixed(1) : null;
      if (diskPercent) {
        title = `Disco em ${diskPercent}% em ${agent}`;
        description = diskFreeGb 
          ? `Apenas ${diskFreeGb}GB livres. O sistema pode parar de funcionar se o disco encher.`
          : `O disco está ${diskPercent}% cheio, espaço crítico.`;
      }
      break;

    case 'agent_offline':
    case 'agent_offline_suspicious':
      const duration = ctx.duration || '';
      const offlineReason = ctx.offline_reason;
      title = `${agent} offline ${duration ? `há ${duration}` : 'de forma inesperada'}`;
      if (offlineReason) {
        description = `${offlineReason}`;
      }
      if (triggerType === 'agent_offline_suspicious') {
        whyUrgent = 'Este agente tem histórico recente de alertas. O offline pode ser tentativa de evasão.';
      }
      break;

    case 'anomaly_detection':
    case 'anomaly':
      const anomalyType = ctx.anomaly_type || ctx.insight_type || 'comportamento';
      title = `Anomalia de ${anomalyType} em ${agent}`;
      if (ctx.evidence && typeof ctx.evidence === 'object') {
        const evidenceKeys = Object.keys(ctx.evidence as object);
        if (evidenceKeys.length > 0) {
          description = `Detectado padrão incomum: ${evidenceKeys.slice(0, 2).join(', ')}`;
        }
      }
      break;

    case 'suspicious_process':
      const processName = ctx.process_name || ctx.process || 'desconhecido';
      title = `Processo suspeito "${processName}" em ${agent}`;
      description = `O processo ${processName} não faz parte do comportamento normal desta máquina.`;
      cta = 'Encerrar processo';
      break;

    case 'multiple_malicious_access':
      const blockedCount = ctx.blocked_requests || ctx.count || 'múltiplas';
      const domain = ctx.domain || 'malicioso';
      title = `${blockedCount} tentativas de acesso a ${domain}`;
      description = `Este computador tentou acessar domínios maliciosos ${blockedCount} vezes.`;
      whyUrgent = 'Múltiplas tentativas indicam malware ativo tentando se comunicar com servidores de controle.';
      break;

    case 'vulnerability_critical':
      const vulnName = ctx.vulnerability_name || ctx.cve || '';
      if (vulnName) {
        title = `Vulnerabilidade crítica ${vulnName} em ${agent}`;
      }
      break;

    case 'antivirus_disabled':
      title = `Antivírus desativado em ${agent}`;
      whyUrgent = 'Sem proteção antivírus, qualquer malware pode infectar o sistema sem ser detectado.';
      break;

    case 'firewall_disabled':
      title = `Firewall desativado em ${agent}`;
      whyUrgent = 'Sem firewall, conexões maliciosas podem acessar o sistema livremente.';
      break;

    case 'safe_mode_detected':
      title = `${agent} em modo de segurança`;
      description = `Este computador entrou em modo de segurança após ${ctx.failure_count || 'múltiplas'} falhas.`;
      break;
  }

  return { title, description, cta, whyUrgent };
}

// CTA map for quick access
export const CTA_MAP: Record<string, string> = {
  isolate_agent: 'Isolar computador agora',
  apply_patch: 'Corrigir agora',
  block_domain: 'Bloquear domínio',
  kill_process: 'Encerrar processo',
  generate_report: 'Gerar relatório',
  notify: 'Notificar equipe',
  lock_user_sessions: 'Bloquear sessões',
  reset_safe_mode: 'Reativar proteções',
};

// Severity display config
export const SEVERITY_CONFIG: Record<string, {
  label: string;
  className: string;
  iconClassName: string;
  borderClassName: string;
  bgClassName: string;
}> = {
  urgent: {
    label: 'Urgente',
    className: 'bg-red-600/10 text-red-600 border-red-600/20',
    iconClassName: 'text-red-600',
    borderClassName: 'border-l-red-600',
    bgClassName: 'bg-red-600/5',
  },
  critical: {
    label: 'Crítico',
    className: 'bg-red-500/10 text-red-500 border-red-500/20',
    iconClassName: 'text-red-500',
    borderClassName: 'border-l-red-500',
    bgClassName: 'bg-red-500/5',
  },
  high: {
    label: 'Alto',
    className: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    iconClassName: 'text-orange-500',
    borderClassName: 'border-l-orange-500',
    bgClassName: 'bg-orange-500/5',
  },
  medium: {
    label: 'Médio',
    className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    iconClassName: 'text-yellow-500',
    borderClassName: 'border-l-yellow-500',
    bgClassName: 'bg-yellow-500/5',
  },
  low: {
    label: 'Baixo',
    className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    iconClassName: 'text-blue-500',
    borderClassName: 'border-l-blue-500',
    bgClassName: 'bg-blue-500/5',
  },
  info: {
    label: 'Info',
    className: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    iconClassName: 'text-slate-500',
    borderClassName: 'border-l-slate-500',
    bgClassName: 'bg-slate-500/5',
  },
};
