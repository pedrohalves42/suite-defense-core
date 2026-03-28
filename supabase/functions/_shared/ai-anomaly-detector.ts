import { logger } from "./logger.ts";
/**
 * AI Anomaly Detector
 * 
 * Detecta comportamentos anomalos em respostas de IA:
 * - Desvio de score alem do esperado
 * - Mudancas bruscas de recomendacao
 * - Token overflow (possivel prompt leaking)
 * - Padroes suspeitos de output
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

// Thresholds de deteccao
const SCORE_DEVIATION_THRESHOLD = 25; // ?25 pontos do historico
const EXTREME_SCORE_LOW = 15;
const EXTREME_SCORE_HIGH = 95;
const TOKEN_OVERFLOW_MULTIPLIER = 2.0; // 2x do esperado

// Padroes suspeitos em respostas
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
        description: `Score ${response.score} desviou ${deviation.toFixed(1)} pontos da media historica ${context.historicalAvg.toFixed(1)}`,
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
        description: `Score extremamente baixo: ${response.score}. Verificar se analise esta correta.`,
        value: response.score,
        threshold: EXTREME_SCORE_LOW,
      });
    } else if (response.score > EXTREME_SCORE_HIGH) {
      anomalies.push({
        type: 'extreme_score',
        severity: 'info',
        description: `Score muito alto: ${response.score}. Pode indicar analise superficial.`,
        value: response.score,
        threshold: EXTREME_SCORE_HIGH,
      });
    }
  }

  // 3. Verificar mudanca brusca de recomendacao
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
        description: `Recomendacao mudou de "${context.lastRecommendation}" para "${response.recommendation}" sem mudanca nos dados.`,
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
        description: `Resposta com ${response.tokenCount} tokens excede o limite esperado de ${threshold.toFixed(0)}. Possivel prompt leaking.`,
        value: response.tokenCount,
        threshold: threshold,
      });
    }
  }

  // 5. Verificar padroes suspeitos na resposta
  if (response.rawResponse) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(response.rawResponse)) {
        anomalies.push({
          type: 'suspicious_pattern',
          severity: 'warning',
          description: `Padrao suspeito detectado na resposta: ${pattern.source.substring(0, 30)}`,
          value: pattern.source,
        });
        break; // Apenas registrar um padrao por resposta
      }
    }
  }

  // Determinar acoes
  const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical');
  const warningAnomalies = anomalies.filter((a) => a.severity === 'warning');

  return {
    valid: anomalies.length === 0,
    anomalies,
    // NUNCA bloquear automaticamente - apenas sinalizar para review humano
    shouldBlock: false,
    requiresReview: warningAnomalies.length > 0 || criticalAnomalies.length > 0,
  };
}

// Rate limiting constants
const RATE_LIMIT_HOURS = 24;
const DOWNGRADE_THRESHOLD = 3;
const SKIP_THRESHOLD = 10;

/**
 * Verifica anomalias recentes do mesmo tipo (rate limiting)
 */
async function checkRecentAnomalies(
  supabase: any,
  tenantId: string,
  functionName: string,
  anomalyType: string,
  hoursBack: number = RATE_LIMIT_HOURS
): Promise<{ count: number; lastSeverity: string | null }> {
  try {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    const { data, error } = await supabase
      .from('ai_anomalies')
      .select('id, severity')
      .eq('tenant_id', tenantId)
      .eq('function_name', functionName)
      .eq('anomaly_type', anomalyType)
      .gte('detected_at', since.toISOString())
      .order('detected_at', { ascending: false })
      .limit(15);
    
    if (error) {
      logger.error('[ai-anomaly-detector] Failed to check recent anomalies:', error);
      return { count: 0, lastSeverity: null };
    }
    
    return {
      count: data?.length || 0,
      lastSeverity: data?.[0]?.severity || null
    };
  } catch (error) {
    logger.error('[ai-anomaly-detector] Error checking recent anomalies:', error);
    return { count: 0, lastSeverity: null };
  }
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
    logger.error('[ai-anomaly-detector] Failed to log anomaly:', error);
  }
}

/**
 * Processa todas as anomalias detectadas com rate limiting
 */
export async function processAnomalies(
  supabase: any,
  validation: BehaviorValidation,
  context: AIContext,
  additionalContext: Record<string, any> = {}
): Promise<void> {
  for (const anomaly of validation.anomalies) {
    // Rate limiting: verificar ocorrencias recentes
    const recent = await checkRecentAnomalies(
      supabase,
      context.tenantId,
      context.functionName,
      anomaly.type
    );
    
    // Skip se 10+ ocorrencias (alert fatigue prevention)
    if (recent.count >= SKIP_THRESHOLD) {
      logger.info(
        `[ai-anomaly-detector] Rate limit: Skipping anomaly log for ${anomaly.type} - ${recent.count} occurrences in last ${RATE_LIMIT_HOURS}h`
      );
      continue;
    }
    
    // Downgrade se 3+ ocorrencias em 24h
    if (recent.count >= DOWNGRADE_THRESHOLD && anomaly.severity === 'critical') {
      anomaly.severity = 'warning';
      anomaly.description += ' [Downgraded: repeated occurrence]';
      logger.info(
        `[ai-anomaly-detector] Downgraded ${anomaly.type} from critical to warning - ${recent.count} recent occurrences`
      );
    }
    
    await logAnomaly(
      supabase,
      context.tenantId,
      context.functionName,
      anomaly,
      { ...additionalContext, recentCount: recent.count }
    );
  }

  // Log resumo se houver anomalias que requerem review
  if (validation.requiresReview) {
    logger.warn(
      `[ai-anomaly-detector] REVIEW REQUIRED: ${validation.anomalies.length} anomalies detected for ${context.functionName} in tenant ${context.tenantId}`
    );
  }
}

/**
 * Calcula estimativa de tokens baseado no tamanho do texto
 * Aproximacao: 1 token ? 4 caracteres para ingles/portugues
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
