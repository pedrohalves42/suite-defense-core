import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { AIInferenceMetrics } from './ai-metrics.ts';
import { logger } from './logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Persist AI metrics to database for dashboard visualization
 */
export async function persistAIMetrics(metrics: AIInferenceMetrics): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const record = {
      function_name: metrics.function_name,
      model: metrics.model,
      latency_ms: metrics.latency_ms,
      success: metrics.success,
      tokens_prompt: metrics.tokens_prompt || null,
      tokens_completion: metrics.tokens_completion || null,
      tokens_total: metrics.tokens_total || null,
      tenant_id: metrics.tenant_id || null,
      error: metrics.error || null,
      used_fallback: metrics.used_fallback || false,
      circuit_breaker_state: metrics.circuit_breaker_state || null,
      request_metadata: {},
      created_at: metrics.timestamp,
    };
    
    const { error } = await supabase
      .from('ai_inference_metrics')
      .insert(record);
    
    if (error) {
      logger.error('[AI Metrics] Failed to persist metrics:', error);
    }
  } catch (err) {
    // Don't throw - metrics persistence should not break the main flow
    logger.error('[AI Metrics] Persistence error:', err);
  }
}

/**
 * Batch persist multiple AI metrics
 */
export async function persistAIMetricsBatch(metricsArray: AIInferenceMetrics[]): Promise<void> {
  if (metricsArray.length === 0) return;
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const records = metricsArray.map(metrics => ({
      function_name: metrics.function_name,
      model: metrics.model,
      latency_ms: metrics.latency_ms,
      success: metrics.success,
      tokens_prompt: metrics.tokens_prompt || null,
      tokens_completion: metrics.tokens_completion || null,
      tokens_total: metrics.tokens_total || null,
      tenant_id: metrics.tenant_id || null,
      error: metrics.error || null,
      used_fallback: metrics.used_fallback || false,
      circuit_breaker_state: metrics.circuit_breaker_state || null,
      request_metadata: {},
      created_at: metrics.timestamp,
    }));
    
    const { error } = await supabase
      .from('ai_inference_metrics')
      .insert(records);
    
    if (error) {
      logger.error('[AI Metrics] Failed to persist batch metrics:', error);
    }
  } catch (err) {
    logger.error('[AI Metrics] Batch persistence error:', err);
  }
}

/**
 * Cleanup old metrics (older than 30 days)
 */
export async function cleanupOldAIMetrics(): Promise<number> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    const { data, error } = await supabase
      .from('ai_inference_metrics')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id');
    
    if (error) {
      logger.error('[AI Metrics] Cleanup error:', error);
      return 0;
    }
    
    return data?.length || 0;
  } catch (err) {
    logger.error('[AI Metrics] Cleanup exception:', err);
    return 0;
  }
}

/**
 * Get AI metrics summary for dashboard
 */
export async function getAIMetricsSummary(tenantId?: string, hoursBack = 24): Promise<{
  total_calls: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
  by_function: Record<string, { calls: number; success_rate: number; avg_latency: number }>;
  by_model: Record<string, { calls: number; total_tokens: number }>;
}> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);
    
    let query = supabase
      .from('ai_inference_metrics')
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false });
    
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    
    const { data, error } = await query;
    
    if (error || !data) {
      return {
        total_calls: 0,
        success_rate: 0,
        avg_latency_ms: 0,
        p95_latency_ms: 0,
        total_tokens: 0,
        by_function: {},
        by_model: {},
      };
    }
    
    const totalCalls = data.length;
    const successCount = data.filter(m => m.success).length;
    const successRate = totalCalls > 0 ? (successCount / totalCalls) * 100 : 0;
    
    const latencies = data.map(m => m.latency_ms).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies[p95Index] || 0;
    
    const totalTokens = data.reduce((sum, m) => sum + (m.tokens_total || 0), 0);
    
    // Aggregate by function
    const byFunction: Record<string, { calls: number; success_rate: number; avg_latency: number }> = {};
    const functionGroups = data.reduce((acc, m) => {
      if (!acc[m.function_name]) {
        acc[m.function_name] = [];
      }
      acc[m.function_name].push(m);
      return acc;
    }, {} as Record<string, typeof data>);
    
    for (const [fn, fnMetricsArr] of Object.entries(functionGroups)) {
      const fnMetrics = fnMetricsArr as typeof data;
      const fnSuccess = fnMetrics.filter((m) => m.success).length;
      const fnLatencies = fnMetrics.map((m) => m.latency_ms);
      byFunction[fn] = {
        calls: fnMetrics.length,
        success_rate: (fnSuccess / fnMetrics.length) * 100,
        avg_latency: fnLatencies.reduce((a, b) => a + b, 0) / fnLatencies.length,
      };
    }
    
    // Aggregate by model
    const byModel: Record<string, { calls: number; total_tokens: number }> = {};
    const modelGroups = data.reduce((acc, m) => {
      if (!acc[m.model]) {
        acc[m.model] = [];
      }
      acc[m.model].push(m);
      return acc;
    }, {} as Record<string, typeof data>);
    
    for (const [model, modelMetricsArr] of Object.entries(modelGroups)) {
      const modelMetrics = modelMetricsArr as typeof data;
      byModel[model] = {
        calls: modelMetrics.length,
        total_tokens: modelMetrics.reduce((sum, m) => sum + (m.tokens_total || 0), 0),
      };
    }
    
    return {
      total_calls: totalCalls,
      success_rate: Math.round(successRate * 10) / 10,
      avg_latency_ms: Math.round(avgLatency),
      p95_latency_ms: Math.round(p95Latency),
      total_tokens: totalTokens,
      by_function: byFunction,
      by_model: byModel,
    };
  } catch (err) {
    logger.error('[AI Metrics] Summary error:', err);
    return {
      total_calls: 0,
      success_rate: 0,
      avg_latency_ms: 0,
      p95_latency_ms: 0,
      total_tokens: 0,
      by_function: {},
      by_model: {},
    };
  }
}
