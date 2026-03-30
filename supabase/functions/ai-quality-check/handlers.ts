/**
 * Action handlers for AI quality check operations.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { runQualityCheck, createQualityAlert, logQualityCheck } from '../_shared/ai-quality-monitor.ts';
import { AIPromptRegistry } from '../_shared/ai-prompt-registry.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const headers = (origin: string | null) => ({ ...buildCorsHeaders(origin), 'Content-Type': 'application/json' });

export async function handlePromptInventory(origin: string | null): Promise<Response> {
  const inventory = await AIPromptRegistry.getPromptInventory();
  const integrityResults: Record<string, boolean> = {};
  for (const prompt of inventory.prompts) {
    integrityResults[prompt.id] = await AIPromptRegistry.verifyPromptIntegrity(prompt.id);
  }
  return new Response(JSON.stringify({
    success: true, inventory, integrity: integrityResults,
    all_valid: Object.values(integrityResults).every(v => v),
  }), { headers: headers(origin) });
}

export async function handleQualityCheck(tenantId: string, origin: string | null): Promise<Response> {
  const functions = ['ai-analyze-agent', 'ai-system-analyzer', 'analyze-network-anomalies', 'analyze-url'];
  const results: Record<string, { passed: boolean; score: number; issues: string[] }> = {};

  for (const fn of functions) {
    const result = await runQualityCheck(fn);
    results[fn] = { passed: result.passed, score: result.score, issues: result.issues };
    logQualityCheck(fn, result);
    if (result.score < 50) {
      await createQualityAlert(fn, {
        type: 'error_rate', severity: 'critical', current_value: result.score,
        baseline_value: 100, deviation_percent: 100 - result.score,
        message: `AI function ${fn} quality score critically low: ${result.score}/100`,
      }, tenantId);
    }
  }

  const overallScore = Math.round(Object.values(results).reduce((sum, r) => sum + r.score, 0) / functions.length);
  return new Response(JSON.stringify({
    success: true, overall_score: overallScore,
    all_passed: Object.values(results).every(r => r.passed),
    results, checked_at: new Date().toISOString(),
  }), { headers: headers(origin) });
}

export async function handleDriftAnalysis(supabase: ReturnType<typeof createClient>, origin: string | null): Promise<Response> {
  const { data: metrics } = await supabase.from('ai_inference_metrics').select('function_name, latency_ms, success, created_at').order('created_at', { ascending: false }).limit(1000);

  if (!metrics || metrics.length === 0) {
    return new Response(JSON.stringify({ success: true, message: 'No metrics available for drift analysis', data: null }), { headers: headers(origin) });
  }

  const functionGroups = metrics.reduce((acc, m) => {
    if (!acc[m.function_name]) acc[m.function_name] = [];
    acc[m.function_name].push(m);
    return acc;
  }, {} as Record<string, typeof metrics>);

  const byFunction: Record<string, { avg_latency: number; success_rate: number; sample_count: number; trend: string }> = {};

  for (const [fn, fnMetrics] of Object.entries(functionGroups)) {
    const latencies = fnMetrics.map(m => m.latency_ms);
    const successCount = fnMetrics.filter(m => m.success).length;
    const midpoint = Math.floor(latencies.length / 2);
    const firstAvg = latencies.slice(0, midpoint).reduce((a, b) => a + b, 0) / (midpoint || 1);
    const secondAvg = latencies.slice(midpoint).reduce((a, b) => a + b, 0) / ((latencies.length - midpoint) || 1);
    const change = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

    byFunction[fn] = {
      avg_latency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      success_rate: Math.round((successCount / fnMetrics.length) * 100),
      sample_count: fnMetrics.length,
      trend: change > 20 ? 'degrading' : change < -20 ? 'improving' : 'stable',
    };
  }

  return new Response(JSON.stringify({ success: true, analysis: byFunction, total_samples: metrics.length, analyzed_at: new Date().toISOString() }), { headers: headers(origin) });
}
