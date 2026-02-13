/**
 * update-baseline Edge Function
 * 
 * Receives behavioral data points from agents and updates baselines.
 * Calculates mean, std deviation, and detects anomalies.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAgent } from '../_shared/agent-auth.ts';

interface BaselinePayload {
  baseline_type: string; // 'cpu_usage' | 'memory_usage' | 'process_count' | 'network_traffic'
  data_points: number[];
  period_start?: string;
  period_end?: string;
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Authenticate agent
    const authResult = await authenticateAgent(supabase, req, 'update-baseline');
    if (!authResult.success) return authResult.response;
    const { agent } = authResult;

    // 2. Parse payload
    const body = await req.json();
    const { baseline_type, data_points, period_start, period_end }: BaselinePayload = body;

    if (!baseline_type || !Array.isArray(data_points) || data_points.length === 0) {
      return new Response(
        JSON.stringify({ error: 'baseline_type and non-empty data_points array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validTypes = ['cpu_usage', 'memory_usage', 'process_count', 'network_traffic', 'disk_io', 'login_frequency'];
    if (!validTypes.includes(baseline_type)) {
      return new Response(
        JSON.stringify({ error: `baseline_type must be one of: ${validTypes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] [update-baseline] Agent ${agent.agent_name}: ${baseline_type} with ${data_points.length} points`);

    // 3. Calculate statistics
    const { mean, stdDev } = calculateStats(data_points);
    const defaultMultiplier = 2.5;

    // 4. Load existing baseline to merge
    const { data: existing } = await supabase
      .from('agent_behavioral_baseline')
      .select('id, baseline_data, mean_value, std_deviation, threshold_multiplier')
      .eq('agent_id', agent.id)
      .eq('baseline_type', baseline_type)
      .eq('is_active', true)
      .maybeSingle();

    const multiplier = existing?.threshold_multiplier ?? defaultMultiplier;
    const anomaliesDetected = detectAnomalies(data_points, mean, stdDev, multiplier);

    const now = new Date().toISOString();

    // 5. Merge with existing data (exponential moving average for stability)
    let finalMean = mean;
    let finalStdDev = stdDev;
    if (existing?.mean_value != null && existing?.std_deviation != null) {
      const alpha = 0.3; // Weight for new data
      finalMean = Math.round((alpha * mean + (1 - alpha) * existing.mean_value) * 100) / 100;
      finalStdDev = Math.round((alpha * stdDev + (1 - alpha) * existing.std_deviation) * 100) / 100;
    }

    // 6. Upsert baseline
    const baselineRow = {
      agent_id: agent.id,
      tenant_id: agent.tenant_id,
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
        console.error(`[${requestId}] [update-baseline] Update error:`, error.message);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('agent_behavioral_baseline')
        .insert(baselineRow);

      if (error) {
        console.error(`[${requestId}] [update-baseline] Insert error:`, error.message);
        throw error;
      }
    }

    // 7. Create alert if anomalies detected
    if (anomaliesDetected > 0) {
      const severity = anomaliesDetected > data_points.length * 0.3 ? 'high' : 'medium';

      await supabase.from('system_alerts').insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        alert_type: 'behavioral_anomaly',
        severity,
        message: `Agent "${agent.agent_name}" detected ${anomaliesDetected} anomalous ${baseline_type} readings (threshold: ${(finalMean + multiplier * finalStdDev).toFixed(1)})`,
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

    console.log(`[${requestId}] [update-baseline] Done: mean=${finalMean}, stdDev=${finalStdDev}, anomalies=${anomaliesDetected} in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        baseline_type,
        baseline_updated: true,
        mean: finalMean,
        std_deviation: finalStdDev,
        anomalies_detected: anomaliesDetected,
        data_points_processed: data_points.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] [update-baseline] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
