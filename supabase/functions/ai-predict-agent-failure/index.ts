/**
 * ai-predict-agent-failure — Modularized
 * Module: trend-analyzer
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { buildAgentTrends, filterRiskyAgents } from './trend-analyzer.ts';

interface PredictionResult {
  agent_id: string;
  agent_name: string;
  failure_probability: number;
  predicted_failure_type: string;
  time_horizon_hours: number;
  contributing_factors: string[];
  recommendation: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  try {
    const authError = assertInternalCaller(req);
    if (authError) return authError;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') {
      return new Response(JSON.stringify({ success: false, error: 'SYSTEM_HALTED' }), { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id;

    let tenantsQuery = supabase.from('tenants').select('id, name');
    if (tenantId) tenantsQuery = tenantsQuery.eq('id', tenantId);
    const { data: tenants } = await tenantsQuery;

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ success: true, predictions: [], message: 'No tenants' }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const allPredictions: PredictionResult[] = [];

    for (const tenant of tenants) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: metrics } = await supabase.from('agent_system_metrics_partitioned').select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, collected_at').eq('tenant_id', tenant.id).gte('collected_at', cutoff).order('collected_at', { ascending: true }).limit(1000);
      if (!metrics || metrics.length < 10) continue;

      const agentIds = [...new Set(metrics.map(m => m.agent_id))];
      const { data: agents } = await supabase.from('agents').select('id, agent_name, hostname, display_name, status').in('id', agentIds);
      const agentMap = new Map((agents || []).map(a => [a.id, a]));

      const trends = buildAgentTrends(metrics, agentMap);
      const riskyAgents = filterRiskyAgents(trends);
      if (riskyAgents.length === 0) continue;

      const systemPrompt = `Voce e um especialista em predicao de falhas de infraestrutura. Analise as tendencias de metricas de agentes e preveja quais tem maior probabilidade de falha nas proximas 4 horas.

Responda APENAS com JSON valido no formato:
[{"agent_id":"string","agent_name":"string","failure_probability":number,"predicted_failure_type":"disk_full"|"memory_exhaustion"|"cpu_overload"|"service_crash","time_horizon_hours":number,"contributing_factors":["string"],"recommendation":"string"}]`;

      const userPrompt = `Agentes em risco para ${tenant.name}:\n${riskyAgents.slice(0, 10).map(a => `- ${a.name} (${a.status}): CPU avg=${a.avg_cpu}% max=${a.max_cpu}% trend=${a.cpu_trend}, MEM avg=${a.avg_mem}% max=${a.max_mem}% trend=${a.mem_trend}, DISCO avg=${a.avg_disk}% max=${a.max_disk}% trend=${a.disk_trend} (${a.samples} amostras)`).join('\n')}\n\nAnalise quais tem maior probabilidade de falha.`;

      const { data: predictions } = await callAIJson<PredictionResult[]>(systemPrompt, userPrompt, { maxTokens: 1024, functionName: 'ai-predict-agent-failure', tenantId: tenant.id });

      if (predictions && Array.isArray(predictions)) {
        const insights = predictions.filter(p => p.failure_probability > 0.5).map(p => ({
          tenant_id: tenant.id, insight_type: 'prediction',
          severity: p.failure_probability > 0.8 ? 'critical' : 'warning',
          title: `Previsao: ${p.agent_name} pode ${p.predicted_failure_type === 'disk_full' ? 'ficar sem disco' : p.predicted_failure_type === 'memory_exhaustion' ? 'esgotar memoria' : 'ter sobrecarga'} em ${p.time_horizon_hours}h`,
          description: `Probabilidade de falha: ${Math.round(p.failure_probability * 100)}%. Fatores: ${p.contributing_factors.join(', ')}`,
          evidence: { prediction: p, analysis_type: 'trend_based' },
          recommendation: p.recommendation, confidence_score: p.failure_probability,
        }));
        if (insights.length > 0) await supabase.from('ai_insights').insert(insights);
        allPredictions.push(...predictions);
      }
    }

    return new Response(JSON.stringify({ success: true, predictions: allPredictions, timestamp: new Date().toISOString() }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    logger.error('[ai-predict-agent-failure] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
