/**
 * Human-readable copy map and helper functions
 */
import type { ActionItem } from './types.ts';

// Events older than 15 minutes are considered historical (not urgent)
export const HISTORICAL_THRESHOLD_MS = 15 * 60 * 1000;

export const ACTION_COPY: Record<string, { title: string; description: string; cta: string }> = {
  vulnerability_critical: {
    title: 'Falha critica que pode permitir invasao',
    description: 'Encontramos uma falha grave com exploit publico disponivel. Se explorada, um invasor pode assumir o controle.',
    cta: 'Corrigir agora',
  },
  vulnerability_high: {
    title: 'Vulnerabilidade de alto impacto',
    description: 'Vulnerabilidade significativa que pode ser explorada em cenarios especificos.',
    cta: 'Avaliar correcao',
  },
  software_risk_detected: {
    title: 'Software de alto risco detectado',
    description: 'Este computador possui software classificado como alto risco que pode comprometer a seguranca.',
    cta: 'Revisar software',
  },
  software_outdated: {
    title: 'Software desatualizado detectado',
    description: 'Versoes antigas de software podem conter vulnerabilidades conhecidas.',
    cta: 'Atualizar software',
  },
  agent_offline: {
    title: 'Computador offline de forma inesperada',
    description: 'Este computador parou de responder sem desligamento normal registrado.',
    cta: 'Analisar situacao',
  },
  agent_offline_suspicious: {
    title: 'Computador offline com comportamento suspeito',
    description: 'Este computador ficou offline apos alertas de seguranca recentes.',
    cta: 'Investigar agora',
  },
  agent_degraded: {
    title: 'Agente com performance degradada',
    description: 'O agente esta respondendo, mas com atrasos ou falhas intermitentes.',
    cta: 'Diagnosticar',
  },
  safe_mode_detected: {
    title: 'Protecoes limitadas ativas',
    description: 'Este computador entrou em modo de seguranca apos falhas e ainda nao retornou ao modo normal.',
    cta: 'Reativar protecoes',
  },
  multiple_malicious_access: {
    title: 'Tentativas DNS maliciosas recorrentes',
    description: 'Foram detectadas multiplas tentativas de acesso a dominios maliciosos.',
    cta: 'Bloquear automaticamente',
  },
  blocked_access_pattern: {
    title: 'Padrao de acesso bloqueado',
    description: 'Multiplas tentativas de acesso a sites bloqueados foram registradas.',
    cta: 'Revisar politica',
  },
  suspicious_network_activity: {
    title: 'Atividade de rede suspeita',
    description: 'Comportamento de rede anomalo foi detectado neste computador.',
    cta: 'Investigar',
  },
  ransomware_detected: {
    title: 'Comportamento de ransomware detectado',
    description: 'Padroes associados a ransomware foram identificados.',
    cta: 'Responder agora',
  },
  data_exfiltration_risk: {
    title: 'Risco de exfiltracao de dados',
    description: 'Transferencia de dados incomum foi detectada.',
    cta: 'Investigar',
  },
  compliance_violation: {
    title: 'Violacao de conformidade detectada',
    description: 'Uma politica de conformidade foi violada neste computador.',
    cta: 'Remediar',
  },
  ai_optimization: {
    title: 'Oportunidade de otimizacao',
    description: 'A IA identificou uma oportunidade para melhorar a seguranca ou performance.',
    cta: 'Ver detalhes',
  },
  ai_threat: {
    title: 'Ameaca detectada pela IA',
    description: 'O motor de IA identificou um padrao de ameaca.',
    cta: 'Investigar',
  },
  automation_triggered: {
    title: 'Automacao disparada',
    description: 'Uma automacao de seguranca foi disparada por evento detectado.',
    cta: 'Revisar acao',
  },
  antivirus_disabled: {
    title: 'Antivirus desativado',
    description: 'A protecao antivirus foi desabilitada neste computador.',
    cta: 'Reativar protecao',
  },
  antivirus_outdated: {
    title: 'Definicoes de virus desatualizadas',
    description: 'As definicoes de virus estao antigas e podem nao detectar ameacas recentes.',
    cta: 'Atualizar definicoes',
  },
  malware_detected: {
    title: 'Malware detectado',
    description: 'Software malicioso foi identificado no sistema.',
    cta: 'Remover ameaca',
  },
};

export function extractAgentFromTitle(title: string): string | null {
  if (!title) return null;
  const patterns = [
    /no Agente\s+([A-Z0-9\-_]+)/i,
    /Agente\s+([A-Z0-9\-_]+)/i,
    /no\s+([A-Z][A-Z0-9\-_]{4,})/i,
    /em\s+([A-Z][A-Z0-9\-_]{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

export function enrichActionItem(item: ActionItem): ActionItem & { humanized: typeof ACTION_COPY[string] | null } {
  const copy = ACTION_COPY[item.trigger_type] || null;

  if (item.source_type === 'ai_insight' && (item.title || item.description)) {
    const recommendation = (item.context as Record<string, unknown>)?.recommendation;
    return {
      ...item,
      humanized: {
        title: item.title || copy?.title || 'Insight de IA',
        description: item.description || copy?.description || '',
        cta: copy?.cta || 'Ver detalhes',
      },
      description: recommendation && item.description && item.description.length < 120
        ? `${item.description} → ${recommendation}`
        : item.description,
    };
  }

  return { ...item, humanized: copy };
}

export function calculateOfflineSeverity(lastHeartbeat: string | null, stateChangedAt: string | null): 'urgent' | 'high' | 'medium' | 'info' {
  const referenceTime = stateChangedAt || lastHeartbeat;
  if (!referenceTime) return 'high';
  const hoursOffline = (Date.now() - new Date(referenceTime).getTime()) / (1000 * 60 * 60);
  if (hoursOffline >= 24) return 'urgent';
  if (hoursOffline >= 6) return 'high';
  if (hoursOffline >= 1) return 'medium';
  return 'info';
}

export function formatOfflineDuration(lastHeartbeat: string | null, stateChangedAt: string | null): string {
  const referenceTime = stateChangedAt || lastHeartbeat;
  if (!referenceTime) return 'tempo indeterminado';
  const offlineDuration = Date.now() - new Date(referenceTime).getTime();
  const hours = Math.floor(offlineDuration / (1000 * 60 * 60));
  const minutes = Math.floor((offlineDuration % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
  if (hours >= 1) return `${hours}h ${minutes}min`;
  return `${minutes} min`;
}

export function calculatePriorityScore(severity: string): number {
  switch (severity) {
    case 'urgent': return 100;
    case 'high': return 75;
    case 'medium': return 40;
    case 'info': return 15;
    default: return 20;
  }
}
