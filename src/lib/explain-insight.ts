import { mapInsightToAction, type InsightActionMapping } from './insight-action-mapping';

export interface InsightExplanation {
  human_title: string;
  human_explanation: string;
  risk_level: string;
  execution_mode: string;
  policy_reference: string;
  what_happened: string;
  why_it_matters: string;
}

export type EffectivenessStatus = 'pending' | 'resolved' | 'partial' | 'failed' | 'unknown';

export interface EffectivenessExplanation {
  status: EffectivenessStatus;
  badge_label: string;
  badge_variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline';
  human_text: string;
  detailed_reason?: string;
}

function getPolicyReference(mode: string): string {
  switch (mode) {
    case 'auto':
      return 'Política de Execução Automática para Ameaças Críticas';
    case 'approval':
      return 'Política de Aprovação Manual para Ações de Alto Impacto';
    case 'suggest':
      return 'Política de Sugestão para Análise Humana';
    default:
      return 'Política Padrão de Segurança';
  }
}

function getRiskLabel(risk: string): string {
  switch (risk) {
    case 'critical':
      return 'crítico';
    case 'high':
      return 'alto';
    case 'medium':
      return 'médio';
    case 'low':
      return 'baixo';
    default:
      return risk;
  }
}

export function explainInsight(
  insight: {
    insight_type: string;
    title: string;
    description?: string | null;
    severity: string;
    auto_action_executed?: boolean;
  },
  mapping?: InsightActionMapping
): InsightExplanation {
  const actionMapping = mapping || mapInsightToAction(insight.insight_type);
  
  const executionMode = insight.auto_action_executed ? 'auto' : actionMapping.mode;
  const wasAutomatic = executionMode === 'auto';
  
  const what_happened = insight.description || 
    `O sistema detectou uma situação classificada como "${insight.title}".`;
  
  const why_it_matters = wasAutomatic
    ? `Como esse comportamento representa risco ${getRiskLabel(actionMapping.risk)}, a ação "${actionMapping.human_label}" foi executada automaticamente para proteger o ambiente.`
    : `Esse comportamento representa risco ${getRiskLabel(actionMapping.risk)} e requer atenção. A ação sugerida é "${actionMapping.human_label}".`;
  
  const human_explanation = `${what_happened} ${why_it_matters}`;
  
  return {
    human_title: actionMapping.human_label,
    human_explanation,
    risk_level: actionMapping.risk,
    execution_mode: executionMode,
    policy_reference: getPolicyReference(executionMode),
    what_happened,
    why_it_matters
  };
}

export function explainDecisionForAudit(
  insight: {
    insight_type: string;
    title: string;
    description?: string | null;
    severity: string;
    evidence?: any | null;
  },
  executedBy: string,
  policyName?: string
): string {
  const mapping = mapInsightToAction(insight.insight_type);
  
  const auditText = `
=== REGISTRO DE DECISÃO DE SEGURANÇA ===

AÇÃO EXECUTADA: ${mapping.human_label}
EXECUTADO POR: ${executedBy}
POLÍTICA APLICADA: ${policyName || getPolicyReference(mapping.mode)}

INSIGHT ORIGINAL:
- Tipo: ${insight.insight_type}
- Título: ${insight.title}
- Severidade: ${insight.severity}
- Descrição: ${insight.description || 'N/A'}

CLASSIFICAÇÃO:
- Nível de Risco: ${mapping.risk}
- Modo de Execução: ${mapping.mode}

EVIDÊNCIAS:
${JSON.stringify(insight.evidence || {}, null, 2)}

=== FIM DO REGISTRO ===
`.trim();

  return auditText;
}

/**
 * Generate human-readable explanation for effectiveness verification result
 */
export function explainEffectiveness(
  status: EffectivenessStatus,
  insightType: string,
  evidence?: any,
  reason?: string
): EffectivenessExplanation {
  const baseExplanations: Record<EffectivenessStatus, { badge_label: string; badge_variant: EffectivenessExplanation['badge_variant']; base_text: string }> = {
    resolved: {
      badge_label: 'Resolvido',
      badge_variant: 'success',
      base_text: 'A ação foi eficaz.'
    },
    partial: {
      badge_label: 'Parcial',
      badge_variant: 'warning',
      base_text: 'A ação reduziu o risco, mas não eliminou totalmente.'
    },
    failed: {
      badge_label: 'Não resolvido',
      badge_variant: 'destructive',
      base_text: 'A ação não resolveu o problema.'
    },
    pending: {
      badge_label: 'Verificando',
      badge_variant: 'secondary',
      base_text: 'Verificação em andamento. Resultado em breve.'
    },
    unknown: {
      badge_label: 'Indeterminado',
      badge_variant: 'outline',
      base_text: 'Não foi possível verificar automaticamente.'
    }
  };

  const base = baseExplanations[status];
  
  // Generate specific text based on insight type and evidence
  let specificText = '';
  
  if (status === 'resolved') {
    switch (insightType) {
      case 'dns_malicious_activity':
      case 'dns_c2_communication':
        const domain = evidence?.domain;
        specificText = domain 
          ? `Nenhuma nova tentativa de acesso ao domínio ${domain} foi detectada após o bloqueio.`
          : 'Nenhuma nova tentativa de comunicação maliciosa foi detectada.';
        break;
      case 'antivirus_disabled':
        specificText = `O antivírus ${evidence?.product || ''} está ativo e funcionando.`;
        break;
      case 'antivirus_outdated':
        specificText = `O antivírus foi atualizado com sucesso.`;
        break;
      case 'safe_mode_prolonged':
        specificText = 'O agente saiu do modo de segurança com sucesso.';
        break;
      case 'agent_offline_suspicious':
        specificText = 'O agente voltou a ficar online e está reportando normalmente.';
        break;
      case 'vulnerability_critical':
      case 'vulnerability_high':
        const cve = evidence?.cve_id;
        specificText = cve 
          ? `A vulnerabilidade ${cve} não está mais presente no sistema.`
          : 'A vulnerabilidade foi corrigida com sucesso.';
        break;
      default:
        specificText = reason || 'O problema foi resolvido conforme esperado.';
    }
  } else if (status === 'partial') {
    specificText = reason || 'O risco foi mitigado parcialmente. Monitoramento contínuo recomendado.';
  } else if (status === 'failed') {
    specificText = reason || 'O comportamento problemático persiste. Ação manual pode ser necessária.';
  } else if (status === 'pending') {
    specificText = 'A verificação será realizada automaticamente em alguns minutos.';
  } else {
    specificText = reason || 'Verificação automática não disponível para este tipo de insight.';
  }

  return {
    status,
    badge_label: base.badge_label,
    badge_variant: base.badge_variant,
    human_text: `${base.base_text} ${specificText}`.trim(),
    detailed_reason: reason
  };
}
