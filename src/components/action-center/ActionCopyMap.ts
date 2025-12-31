import { AlertTriangle, Shield, Wifi, WifiOff, Bug, Lock, Bell, Zap, FileText, Activity, Brain, Eye, TrendingUp, AlertCircle } from 'lucide-react';

export interface ActionCopy {
  title: string;
  description: string;
  cta: string;
  impact: string;
  icon: typeof AlertTriangle;
}

// Human-readable copy for each trigger type
export const ACTION_COPY_MAP: Record<string, ActionCopy> = {
  vulnerability_critical: {
    title: 'Falha crítica que pode permitir invasão',
    description: 'Encontramos uma falha grave com exploit público disponível. Se explorada, um invasor pode assumir o controle da máquina.',
    impact: 'Risco alto de comprometimento total do sistema.',
    cta: 'Corrigir agora',
    icon: Bug,
  },
  software_risk_detected: {
    title: 'Software de alto risco detectado',
    description: 'Este computador possui um software classificado como alto risco que pode comprometer a segurança.',
    impact: 'Pode permitir acesso externo sem supervisão.',
    cta: 'Revisar software',
    icon: Shield,
  },
  agent_offline: {
    title: 'Computador offline de forma inesperada',
    description: 'Este computador parou de responder sem desligamento normal registrado.',
    impact: 'Pode indicar falha grave, desligamento forçado ou tentativa de evasão.',
    cta: 'Analisar situação',
    icon: WifiOff,
  },
  agent_offline_suspicious: {
    title: 'Computador offline com comportamento suspeito',
    description: 'Este computador ficou offline sem desligamento esperado e possui histórico recente de alertas.',
    impact: 'Forte indício de problema ou tentativa de evasão.',
    cta: 'Investigar agora',
    icon: WifiOff,
  },
  multiple_malicious_access: {
    title: 'Tentativas DNS maliciosas recorrentes',
    description: 'Foram detectadas múltiplas tentativas de acesso a domínios conhecidos por distribuir malware.',
    impact: 'Forte indício de infecção ativa ou comportamento malicioso.',
    cta: 'Bloquear automaticamente',
    icon: Wifi,
  },
  suspicious_process: {
    title: 'Processo incomum em execução',
    description: 'Um programa que não faz parte do comportamento normal deste computador está rodando no momento.',
    impact: 'Pode ser legítimo, mas também pode indicar execução não autorizada.',
    cta: 'Encerrar processo',
    icon: Activity,
  },
  safe_mode_detected: {
    title: 'Proteções limitadas por segurança preventiva',
    description: 'Este computador entrou em modo de segurança após falhas anteriores e ainda não retornou ao modo normal.',
    impact: 'Algumas proteções automáticas estão temporariamente desativadas.',
    cta: 'Reativar proteções',
    icon: Lock,
  },
  manual: {
    title: 'Ação manual pendente',
    description: 'Uma ação foi criada manualmente e aguarda execução.',
    impact: 'Requer atenção do administrador.',
    cta: 'Executar ação',
    icon: Zap,
  },
  // AI Insight types
  vulnerability: {
    title: 'Vulnerabilidade detectada pela IA',
    description: 'Nossa análise automática identificou uma falha de segurança que requer atenção.',
    impact: 'Risco de exploração se não corrigido.',
    cta: 'Ver recomendação',
    icon: Brain,
  },
  anomaly: {
    title: 'Comportamento anômalo detectado',
    description: 'Padrão incomum identificado que pode indicar problema de segurança.',
    impact: 'Pode ser comportamento malicioso ou configuração incorreta.',
    cta: 'Analisar',
    icon: Eye,
  },
  compliance: {
    title: 'Problema de conformidade',
    description: 'Configuração ou comportamento fora dos padrões de segurança esperados.',
    impact: 'Pode afetar auditorias e compliance.',
    cta: 'Corrigir',
    icon: FileText,
  },
  performance: {
    title: 'Problema de performance detectado',
    description: 'Métricas de sistema indicam degradação que pode afetar operações.',
    impact: 'Pode indicar problema maior ou ataque.',
    cta: 'Otimizar',
    icon: TrendingUp,
  },
  security_posture: {
    title: 'Postura de segurança comprometida',
    description: 'Análise indica configurações ou estados que enfraquecem a segurança.',
    impact: 'Aumenta superfície de ataque.',
    cta: 'Fortalecer',
    icon: Shield,
  },
  threat_intel: {
    title: 'Indicador de ameaça detectado',
    description: 'Inteligência de ameaças identificou potencial risco.',
    impact: 'Possível atividade maliciosa em andamento.',
    cta: 'Investigar',
    icon: AlertCircle,
  },
};

// Default copy for unknown trigger types
export const DEFAULT_ACTION_COPY: ActionCopy = {
  title: 'Ação pendente',
  description: 'Uma ação foi detectada e aguarda sua decisão.',
  impact: 'Requer análise.',
  cta: 'Ver detalhes',
  icon: AlertTriangle,
};

// Get copy for a trigger type, with fallback
export function getActionCopy(triggerType: string): ActionCopy {
  return ACTION_COPY_MAP[triggerType] || DEFAULT_ACTION_COPY;
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
