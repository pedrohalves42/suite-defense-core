/**
 * update-baseline Edge Function
 * 
 * Receives behavioral data points from agents and updates baselines.
 * Calculates mean, std deviation, and detects anomalies.
 * 
 * Migrated to serveAgent middleware (Phase 2, Step 2.4)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const VALID_BASELINE_TYPES = ['cpu_usage', 'memory_usage', 'process_count', 'network_traffic', 'disk_io', 'login_frequency'] as const;

const BaselineSchema = z.object({
  baseline_type: z.enum(VALID_BASELINE_TYPES),
  data_points: z.array(z.number().finite()).min(1, 'data_points must have at least 1 element').max(10000),
  period_start: z.string().datetime().optional(),
  period_end: z.string().datetime().optional(),
});

function calculateStats(data: number[]): { mean: number; stdDev: number } {
  if (data.length === 0) return { mean: 0, stdDev: 0 };
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  return { mean: Math.round(mean * 100) / 100, stdDev: Math.round(Math.sqrt(variance) * 100) / 100 };
}

function detectAnomalies(
  dataPoints: number[],
  mean: number,
  stdDev: number,
  multiplier: number,
): number {
  if (stdDev === 0) return 0;
  const threshold = mean + multiplier * stdDev;
  return dataPoints.filter((v) => v > threshold).length;
}

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const startedAt = Date.now();

  const parsed = BaselineSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { baseline_type, data_points, period_start, period_end } = parsed.data;

  logger.info(`[${requestId}] [update-baseline] Agent ${agentName}: ${baseline_type} with ${data_points.length} points`);

  // Calculate statistics
  const { mean, stdDev } = calculateStats(data_points);
  const defaultMultiplier = 2.5;

  // Load existing baseline to merge
  const { data: existing } = await supabase
    .from('agent_behavioral_baseline')
    .select('id, baseline_data, mean_value, std_deviation, threshold_multiplier')
    .eq('agent_id', agentId)
    .eq('baseline_type', baseline_type)
    .eq('is_active', true)
    .maybeSingle();

  const multiplier = existing?.threshold_multiplier ?? defaultMultiplier;
  const anomaliesDetected = detectAnomalies(data_points, mean, stdDev, multiplier);

  const now = new Date().toISOString();

  // Merge with existing data (exponential moving average for stability)
  let finalMean = mean;
  let finalStdDev = stdDev;
  if (existing?.mean_value != null && existing?.std_deviation != null) {
    const alpha = 0.3;
    finalMean = Math.round((alpha * mean + (1 - alpha) * existing.mean_value) * 100) / 100;
    finalStdDev = Math.round((alpha * stdDev + (1 - alpha) * existing.std_deviation) * 100) / 100;
  }

  // Upsert baseline
  const baselineRow = {
    agent_id: agentId,
    tenant_id: tenantId,
    baseline_type,
    mean_value: finalMean,
    std_deviation: finalStdDev,
    threshold_multiplier: multiplier,
    baseline_data: { recent_points: data_points.slice(-100), sample_size: data_points.length },
    baseline_period_start: period_start || now,
    baseline_period_end: period_end || now,
    is_active: true,
    last_updated: now,
  };

  if (existing) {
    const { error } = await supabase
      .from('agent_behavioral_baseline')
      .update(baselineRow)
      .eq('id', existing.id);
    if (error) {
      logger.error(`[${requestId}] [update-baseline] Update error:`, error.message);
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('agent_behavioral_baseline')
      .insert(baselineRow);
    if (error) {
      logger.error(`[${requestId}] [update-baseline] Insert error:`, error.message);
      throw error;
    }
  }

  // Create alert if anomalies detected
  if (anomaliesDetected > 0) {
    const severity = anomaliesDetected > data_points.length * 0.3 ? 'high' : 'medium';

    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      alert_type: 'behavioral_anomaly',
      severity,
      message: `Agent "${agentName}" detected ${anomaliesDetected} anomalous ${baseline_type} readings (threshold: ${(finalMean + multiplier * finalStdDev).toFixed(1)})`,
      resolved: false,
      metadata: {
        baseline_type,
        anomalies_detected: anomaliesDetected,
        total_points: data_points.length,
        mean: finalMean,
        std_deviation: finalStdDev,
        threshold: finalMean + multiplier * finalStdDev,
        detected_at: now,
      },
    });
  }

  const durationMs = Date.now() - startedAt;

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'update-baseline',
      p_success: true,
      p_duration_ms: durationMs,
      p_result: { baseline_type, mean: finalMean, std_dev: finalStdDev, anomalies: anomaliesDetected },
      p_processed_count: data_points.length,
      p_job_source: 'agent',
    });
  } catch (_) { /* non-critical */ }

  logger.info(`[${requestId}] [update-baseline] Done: mean=${finalMean}, stdDev=${finalStdDev}, anomalies=${anomaliesDetected} in ${durationMs}ms`);

  return {
    success: true,
    baseline_type,
    baseline_updated: true,
    mean: finalMean,
    std_deviation: finalStdDev,
    anomalies_detected: anomaliesDetected,
    data_points_processed: data_points.length,
    property_schema: ['baseline_type', 'mean', 'std_deviation', 'threshold', 'anomalies_detected', 'last_updated'],
  };
});
