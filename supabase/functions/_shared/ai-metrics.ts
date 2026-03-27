import { logger } from "./logger.ts";
/**
 * AI Inference Metrics Logger
 * Tracks latency, model usage, success rates, and token consumption
 */

export interface AIInferenceMetrics {
  timestamp: string;
  function_name: string;
  model: string;
  latency_ms: number;
  success: boolean;
  tokens_prompt?: number;
  tokens_completion?: number;
  tokens_total?: number;
  tenant_id?: string;
  error?: string;
  used_fallback?: boolean;
  circuit_breaker_state?: 'closed' | 'open' | 'half-open';
}

/**
 * Log AI inference metrics in structured format
 */
export function logAIMetrics(metrics: AIInferenceMetrics): void {
  const logEntry = {
    type: 'ai_inference_metrics',
    ...metrics,
  };

  // Structured log for observability platforms
  logger.info(JSON.stringify(logEntry));
}

/**
 * Measure AI call execution and log metrics
 */
export async function measureAICall<T>(
  functionName: string,
  model: string,
  tenantId: string | undefined,
  fn: () => Promise<T>
): Promise<{ result: T; metrics: AIInferenceMetrics }> {
  const startTime = Date.now();
  let success = false;
  let error: string | undefined;
  let result: T;

  try {
    result = await fn();
    success = true;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
    throw e;
  } finally {
    const latencyMs = Date.now() - startTime;
    const metrics: AIInferenceMetrics = {
      timestamp: new Date().toISOString(),
      function_name: functionName,
      model,
      latency_ms: latencyMs,
      success,
      tenant_id: tenantId,
      error,
    };

    logAIMetrics(metrics);
  }

  return {
    result: result!,
    metrics: {
      timestamp: new Date().toISOString(),
      function_name: functionName,
      model,
      latency_ms: Date.now() - startTime,
      success: true,
      tenant_id: tenantId,
    },
  };
}

/**
 * Extract token usage from AI response (if available)
 */
export function extractTokenUsage(response: any): { prompt?: number; completion?: number; total?: number } {
  try {
    if (response?.usage) {
      return {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      };
    }
  } catch {
    // Ignore parsing errors
  }
  return {};
}

/**
 * Create metrics logger for a specific function
 */
export function createMetricsLogger(functionName: string, model: string = 'google/gemini-2.5-flash') {
  return {
    logStart: (tenantId?: string) => {
      logger.info(JSON.stringify({
        type: 'ai_call_start',
        function_name: functionName,
        model,
        tenant_id: tenantId,
        timestamp: new Date().toISOString(),
      }));
      return Date.now();
    },

    logSuccess: (startTime: number, tenantId?: string, tokens?: { prompt?: number; completion?: number; total?: number }) => {
      const metrics: AIInferenceMetrics = {
        timestamp: new Date().toISOString(),
        function_name: functionName,
        model,
        latency_ms: Date.now() - startTime,
        success: true,
        tenant_id: tenantId,
        tokens_prompt: tokens?.prompt,
        tokens_completion: tokens?.completion,
        tokens_total: tokens?.total,
      };
      logAIMetrics(metrics);
    },

    logFailure: (startTime: number, error: string, tenantId?: string, usedFallback?: boolean) => {
      const metrics: AIInferenceMetrics = {
        timestamp: new Date().toISOString(),
        function_name: functionName,
        model,
        latency_ms: Date.now() - startTime,
        success: false,
        tenant_id: tenantId,
        error,
        used_fallback: usedFallback,
      };
      logAIMetrics(metrics);
    },
  };
}
