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

/**
 * Generates a human-readable explanation for an insight decision
 */
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
  const decision = mapping || mapInsightToAction(insight.insight_type);
  
  const riskDescriptions: Record<string, string> = {
    critical: 'risco crítico que requer ação imediata',
    high: 'risco alto que pode comprometer a segurança',
    medium: 'risco moderado que deve ser monitorado',
    low: 'risco baixo para acompanhamento',
  };

  const modeDescriptions: Record<string, string> = {
    auto: 'executada automaticamente pelo sistema',
    approval: 'submetida para aprovação manual',
    suggest: 'sugerida para análise',
  };

  const policyReferences: Record<string, string> = {
    auto: 'Política de Execução Automática para Ameaças Críticas',
    approval: 'Política de Aprovação Manual para Ações de Alto Impacto',
    suggest: 'Política de Sugestões para Análise Humana',
  };

  const whatHappened = insight.auto_action_executed
    ? `A ação "${decision.human_label}" foi ${modeDescriptions[decision.mode]}.`
    : decision.mode === 'auto'
    ? `A ação "${decision.human_label}" será executada automaticamente.`
    : `A ação "${decision.human_label}" aguarda aprovação.`;

  const whyItMatters = `Esse comportamento é classificado como ${riskDescriptions[decision.risk] || 'risco desconhecido'}. ${
    decision.mode === 'auto'
      ? 'O sistema agiu automaticamente para minimizar o tempo de exposição.'
      : 'Aguardando decisão humana devido à natureza da ação.'
  }`;

  return {
    human_title: decision.human_label,
    human_explanation: `${insight.description || insight.title}. ${whatHappened}`,
    risk_level: decision.risk,
    execution_mode: decision.mode,
    policy_reference: policyReferences[decision.mode] || 'Política Padrão',
    what_happened: whatHappened,
    why_it_matters: whyItMatters,
  };
}

/**
 * Generates a detailed explanation for audit/compliance reports
 */
export function explainDecisionForAudit(
  insight: {
    insight_type: string;
    title: string;
    description?: string | null;
    severity: string;
    evidence?: Record<string, unknown> | null;
  },
  executedBy: string,
  policyName?: string
): string {
  const decision = mapInsightToAction(insight.insight_type);
  
  return `
O sistema executou a ação "${decision.human_label}" porque ${insight.description || insight.title}.
Essa decisão seguiu a política "${policyName || decision.mode === 'auto' ? 'Execução Automática' : 'Aprovação Manual'}",
configurada para permitir execução ${decision.mode === 'auto' ? 'automática' : 'com aprovação'} nesse cenário.

Detalhes:
- Tipo de insight: ${insight.insight_type}
- Nível de risco: ${decision.risk}
- Severidade: ${insight.severity}
- Executado por: ${executedBy}
${insight.evidence ? `- Evidências: ${JSON.stringify(insight.evidence, null, 2)}` : ''}
`.trim();
}
