/**
 * AI Anomaly Detector
 * 
 * Detecta comportamentos anômalos em respostas de IA:
 * - Desvio de score além do esperado
 * - Mudanças bruscas de recomendação
 * - Token overflow (possível prompt leaking)
 * - Padrões suspeitos de output
 */

export interface AIContext {
  tenantId: string;
  functionName: string;
  historicalAvg?: number;
  lastRecommendation?: string;
  metricsUnchanged?: boolean;
  expectedMaxTokens?: number;
}

export interface AIResponse {
  score?: number;
  recommendation?: string;
  tokenCount?: number;
  rawResponse?: string;
}

export interface AnomalyFlag {
  type: 'score_deviation' | 'recommendation_flip' | 'token_overflow' | 'suspicious_pattern' | 'extreme_score';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  value?: number | string;
  threshold?: number | string;
}

export interface BehaviorValidation {
  valid: boolean;
  anomalies: AnomalyFlag[];
  shouldBlock: boolean;
  requiresReview: boolean;
}

// Thresholds de detecção
const SCORE_DEVIATION_THRESHOLD = 25; // ±25 pontos do histórico
const EXTREME_SCORE_LOW = 15;
const EXTREME_SCORE_HIGH = 95;
const TOKEN_OVERFLOW_MULTIPLIER = 2.0; // 2x do esperado

// Padrões suspeitos em respostas
const SUSPICIOUS_PATTERNS = [
  /\[SYSTEM\]/gi,
  /\[IGNORE\]/gi,
  /my previous instructions/gi,
  /as an AI/gi,
  /I cannot/gi,
  /I'm sorry, but/gi,
];

/**
 * Valida comportamento de resposta da IA
 */
export function validateAIBehavior(
  response: AIResponse,
  context: AIContext
): BehaviorValidation {
  const anomalies: AnomalyFlag[] = [];

  // 1. Verificar desvio de score
  if (
    response.score !== undefined &&
    context.historicalAvg !== undefined &&
    context.historicalAvg > 0
  ) {
    const deviation = Math.abs(response.score - context.historicalAvg);
    if (deviation > SCORE_DEVIATION_THRESHOLD) {
      anomalies.push({
        type: 'score_deviation',
        severity: deviation > 40 ? 'critical' : 'warning',
        description: `Score ${response.score} desviou ${deviation.toFixed(1)} pontos da média histórica ${context.historicalAvg.toFixed(1)}`,
        value: response.score,
        threshold: context.historicalAvg,
      });
    }
  }

  // 2. Verificar scores extremos
  if (response.score !== undefined) {
    if (response.score < EXTREME_SCORE_LOW) {
      anomalies.push({
        type: 'extreme_score',
        severity: 'warning',
        description: `Score extremamente baixo: ${response.score}. Verificar se análise está correta.`,
        value: response.score,
        threshold: EXTREME_SCORE_LOW,
      });
    } else if (response.score > EXTREME_SCORE_HIGH) {
      anomalies.push({
        type: 'extreme_score',
        severity: 'info',
        description: `Score muito alto: ${response.score}. Pode indicar análise superficial.`,
        value: response.score,
        threshold: EXTREME_SCORE_HIGH,
      });
    }
  }

  // 3. Verificar mudança brusca de recomendação
  if (
    response.recommendation &&
    context.lastRecommendation &&
    context.metricsUnchanged
  ) {
    const recommendationChanged =
      response.recommendation.toLowerCase() !== context.lastRecommendation.toLowerCase();

    if (recommendationChanged) {
      anomalies.push({
        type: 'recommendation_flip',
        severity: 'warning',
        description: `Recomendação mudou de "${context.lastRecommendation}" para "${response.recommendation}" sem mudança nos dados.`,
        value: response.recommendation,
        threshold: context.lastRecommendation,
      });
    }
  }

  // 4. Verificar token overflow
  if (
    response.tokenCount !== undefined &&
    context.expectedMaxTokens !== undefined
  ) {
    const threshold = context.expectedMaxTokens * TOKEN_OVERFLOW_MULTIPLIER;
    if (response.tokenCount > threshold) {
      anomalies.push({
        type: 'token_overflow',
        severity: 'critical',
        description: `Resposta com ${response.tokenCount} tokens excede o limite esperado de ${threshold.toFixed(0)}. Possível prompt leaking.`,
        value: response.tokenCount,
        threshold: threshold,
      });
    }
  }

  // 5. Verificar padrões suspeitos na resposta
  if (response.rawResponse) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(response.rawResponse)) {
        anomalies.push({
          type: 'suspicious_pattern',
          severity: 'warning',
          description: `Padrão suspeito detectado na resposta: ${pattern.source.substring(0, 30)}`,
          value: pattern.source,
        });
        break; // Apenas registrar um padrão por resposta
      }
    }
  }

  // Determinar ações
  const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical');
  const warningAnomalies = anomalies.filter((a) => a.severity === 'warning');

  return {
    valid: anomalies.length === 0,
    anomalies,
    shouldBlock: criticalAnomalies.length > 0,
    requiresReview: warningAnomalies.length > 0 || criticalAnomalies.length > 0,
  };
}

/**
 * Registra anomalia no banco de dados
 */
export async function logAnomaly(
  supabase: any,
  tenantId: string,
  functionName: string,
  anomaly: AnomalyFlag,
  context: Record<string, any> = {}
): Promise<void> {
  try {
    await supabase.from('ai_anomalies').insert({
      tenant_id: tenantId,
      function_name: functionName,
      anomaly_type: anomaly.type,
      severity: anomaly.severity,
      context: {
        description: anomaly.description,
        value: anomaly.value,
        threshold: anomaly.threshold,
        ...context,
      },
    });
  } catch (error) {
    console.error('[ai-anomaly-detector] Failed to log anomaly:', error);
  }
}

/**
 * Processa todas as anomalias detectadas
 */
export async function processAnomalies(
  supabase: any,
  validation: BehaviorValidation,
  context: AIContext,
  additionalContext: Record<string, any> = {}
): Promise<void> {
  for (const anomaly of validation.anomalies) {
    await logAnomaly(
      supabase,
      context.tenantId,
      context.functionName,
      anomaly,
      additionalContext
    );
  }

  // Log resumo se houver anomalias críticas
  if (validation.shouldBlock) {
    console.warn(
      `[ai-anomaly-detector] CRITICAL: ${validation.anomalies.length} anomalies detected for ${context.functionName} in tenant ${context.tenantId}`
    );
  }
}

/**
 * Calcula estimativa de tokens baseado no tamanho do texto
 * Aproximação: 1 token ≈ 4 caracteres para inglês/português
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
