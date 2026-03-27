/**
 * AI Quality Monitoring - Drift Detection, Hallucination Checks, Alerts
 * 
 * P3 Implementation: Quality assurance for AI outputs
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============ TYPES ============

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  issues: string[];
  metrics: {
    latency_drift: number; // % deviation from baseline
    error_rate_drift: number;
    confidence_avg: number;
    hallucination_flags: number;
  };
}

export interface DriftAlert {
  type: 'latency' | 'error_rate' | 'confidence' | 'hallucination';
  severity: 'warning' | 'critical';
  current_value: number;
  baseline_value: number;
  deviation_percent: number;
  message: string;
}

// ============ BASELINES ============

const QUALITY_BASELINES = {
  // Latency thresholds (ms)
  latency_p50: 500,
  latency_p95: 2000,
  latency_p99: 5000,
  
  // Error rate thresholds (%)
  error_rate_warning: 5,
  error_rate_critical: 15,
  
  // Confidence thresholds
  min_confidence: 60,
  avg_confidence_warning: 70,
  
  // Hallucination detection
  hallucination_rate_warning: 2, // %
  hallucination_rate_critical: 5,
  
  // Drift thresholds (% deviation from 7-day average)
  drift_warning_threshold: 25,
  drift_critical_threshold: 50,
};

// ============ QUALITY CHECKS ============

/**
 * Check AI output for potential hallucination markers
 */
export function checkForHallucination(
  output: string,
  providedContext: string[]
): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Check 1: Fabricated specific numbers without context
  const numberPatterns = output.match(/\b\d{6,}\b/g) || [];
  for (const num of numberPatterns) {
    const inContext = providedContext.some(ctx => ctx.includes(num));
    if (!inContext && num.length > 8) {
      reasons.push(`Potentially fabricated number: ${num.substring(0, 10)}...`);
    }
  }
  
  // Check 2: Claims about data not in context
  const claimPatterns = [
    /according to (?:the|your|our) (?:data|logs|records)/i,
    /the (?:data|logs|metrics) (?:show|indicate|reveal)/i,
    /based on (?:historical|previous|past) data/i,
  ];
  
  for (const pattern of claimPatterns) {
    if (pattern.test(output)) {
      // Verify claim has supporting context
      const hasEvidence = providedContext.length > 0;
      if (!hasEvidence) {
        reasons.push(`Claim without supporting context: ${pattern.source}`);
      }
    }
  }
  
  // Check 3: Specific dates/times not in context
  const datePatterns = output.match(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?\b/g) || [];
  for (const date of datePatterns) {
    const inContext = providedContext.some(ctx => ctx.includes(date));
    if (!inContext) {
      reasons.push(`Date not found in context: ${date}`);
    }
  }
  
  // Check 4: Confidence without evidence
  const highConfidencePattern = /(?:definitely|certainly|100%|absolutely sure)/i;
  if (highConfidencePattern.test(output) && providedContext.length < 3) {
    reasons.push('High confidence claim with minimal evidence');
  }
  
  return {
    flagged: reasons.length > 0,
    reasons,
  };
}

/**
 * Detect drift in AI metrics over time
 */
export async function detectDrift(
  functionName: string,
  hoursBack = 24,
  baselineHours = 168 // 7 days
): Promise<{ drifts: DriftAlert[]; baseline: Record<string, number>; current: Record<string, number> }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const drifts: DriftAlert[] = [];
  
  const now = new Date();
  const currentStart = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  const baselineStart = new Date(now.getTime() - baselineHours * 60 * 60 * 1000);
  
  // Get current period metrics
  const { data: currentData } = await supabase
    .from('ai_inference_metrics')
    .select('latency_ms, success, error')
    .eq('function_name', functionName)
    .gte('created_at', currentStart.toISOString());
  
  // Get baseline period metrics
  const { data: baselineData } = await supabase
    .from('ai_inference_metrics')
    .select('latency_ms, success, error')
    .eq('function_name', functionName)
    .gte('created_at', baselineStart.toISOString())
    .lt('created_at', currentStart.toISOString());
  
  // Calculate metrics
  const calcMetrics = (data: { latency_ms: number; success: boolean; error: string | null }[] | null) => {
    if (!data || data.length === 0) {
      return { avg_latency: 0, error_rate: 0, count: 0 };
    }
    const latencies = data.map(d => d.latency_ms);
    const errors = data.filter(d => !d.success).length;
    return {
      avg_latency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      error_rate: (errors / data.length) * 100,
      count: data.length,
    };
  };
  
  const current = calcMetrics(currentData);
  const baseline = calcMetrics(baselineData);
  
  // Check latency drift
  if (baseline.avg_latency > 0 && current.count > 10) {
    const latencyDrift = ((current.avg_latency - baseline.avg_latency) / baseline.avg_latency) * 100;
    
    if (latencyDrift > QUALITY_BASELINES.drift_critical_threshold) {
      drifts.push({
        type: 'latency',
        severity: 'critical',
        current_value: current.avg_latency,
        baseline_value: baseline.avg_latency,
        deviation_percent: latencyDrift,
        message: `Latency increased ${latencyDrift.toFixed(1)}% from baseline (${baseline.avg_latency.toFixed(0)}ms → ${current.avg_latency.toFixed(0)}ms)`,
      });
    } else if (latencyDrift > QUALITY_BASELINES.drift_warning_threshold) {
      drifts.push({
        type: 'latency',
        severity: 'warning',
        current_value: current.avg_latency,
        baseline_value: baseline.avg_latency,
        deviation_percent: latencyDrift,
        message: `Latency increased ${latencyDrift.toFixed(1)}% from baseline`,
      });
    }
  }
  
  // Check error rate drift
  if (current.count > 10) {
    if (current.error_rate > QUALITY_BASELINES.error_rate_critical) {
      drifts.push({
        type: 'error_rate',
        severity: 'critical',
        current_value: current.error_rate,
        baseline_value: baseline.error_rate,
        deviation_percent: current.error_rate - baseline.error_rate,
        message: `Error rate at ${current.error_rate.toFixed(1)}% (critical threshold: ${QUALITY_BASELINES.error_rate_critical}%)`,
      });
    } else if (current.error_rate > QUALITY_BASELINES.error_rate_warning) {
      drifts.push({
        type: 'error_rate',
        severity: 'warning',
        current_value: current.error_rate,
        baseline_value: baseline.error_rate,
        deviation_percent: current.error_rate - baseline.error_rate,
        message: `Error rate at ${current.error_rate.toFixed(1)}% (warning threshold: ${QUALITY_BASELINES.error_rate_warning}%)`,
      });
    }
  }
  
  return {
    drifts,
    baseline: {
      avg_latency: baseline.avg_latency,
      error_rate: baseline.error_rate,
      sample_size: baseline.count,
    },
    current: {
      avg_latency: current.avg_latency,
      error_rate: current.error_rate,
      sample_size: current.count,
    },
  };
}

/**
 * Run comprehensive quality check
 */
export async function runQualityCheck(functionName: string): Promise<QualityCheckResult> {
  const issues: string[] = [];
  let score = 100;
  
  // Detect drift
  const driftResult = await detectDrift(functionName);
  
  const metrics = {
    latency_drift: 0,
    error_rate_drift: 0,
    confidence_avg: 0,
    hallucination_flags: 0,
  };
  
  // Process drift alerts
  for (const drift of driftResult.drifts) {
    if (drift.type === 'latency') {
      metrics.latency_drift = drift.deviation_percent;
      if (drift.severity === 'critical') {
        score -= 20;
        issues.push(`CRITICAL: ${drift.message}`);
      } else {
        score -= 10;
        issues.push(`WARNING: ${drift.message}`);
      }
    }
    
    if (drift.type === 'error_rate') {
      metrics.error_rate_drift = drift.deviation_percent;
      if (drift.severity === 'critical') {
        score -= 30;
        issues.push(`CRITICAL: ${drift.message}`);
      } else {
        score -= 15;
        issues.push(`WARNING: ${drift.message}`);
      }
    }
  }
  
  // Check sample size
  if (driftResult.current.sample_size < 10) {
    issues.push('INFO: Insufficient data for reliable drift detection (< 10 samples)');
    score -= 5;
  }
  
  return {
    passed: score >= 70,
    score: Math.max(0, score),
    issues,
    metrics,
  };
}

/**
 * Create quality alert in database
 */
export async function createQualityAlert(
  functionName: string,
  alert: DriftAlert,
  tenantId?: string
): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId || null,
      alert_type: `ai_quality_${alert.type}`,
      severity: alert.severity === 'critical' ? 'critical' : 'medium',
      message: alert.message,
      data: {
        function_name: functionName,
        current_value: alert.current_value,
        baseline_value: alert.baseline_value,
        deviation_percent: alert.deviation_percent,
      },
      resolved: false,
    });
  } catch (err) {
    logger.error('[AI Quality] Failed to create alert:', err);
  }
}

/**
 * Log quality check for audit
 */
export function logQualityCheck(
  functionName: string,
  result: QualityCheckResult
): void {
  logger.info(JSON.stringify({
    type: 'ai_quality_check',
    function_name: functionName,
    passed: result.passed,
    score: result.score,
    issues_count: result.issues.length,
    metrics: result.metrics,
    timestamp: new Date().toISOString(),
  }));
}
