/**
 * ai-predict-agent-failure → Migrated to serveInternal middleware
 * Module: trend-analyzer
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { logger } from '../_shared/logger.ts';
import { buildAgentTrends, filterRiskyAgents } from './trend-analyzer.ts';

interface PredictionResult {
  agent_id: string; agent_name: string; failure_probability: number;
  predicted_failure_type: string; time_horizon_hours: number;
  contributing_factors: string[]; recommendation: string;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') return new Response(JSON.stringify({ success: false, error: 'SYSTEM_HALTED' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  const tenantId = (body as Record<string, unknown>)?.tenant_id as string | undefined;
  let tenantsQuery = supabase.from('tenants').select('id, name');
  if (tenantId) tenantsQuery = tenantsQuery.eq('id', tenantId);
  const { data: tenants } = await tenantsQuery;

  if (!tenants || tenants.length === 0) return { success: true, predictions: [], message: 'No tenants' };

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

    const systemPrompt = `Voce e um especialista em predicao de falhas de infraestrutura. Analise tendencias e preveja falhas nas proximas 4 horas.\nResponda com JSON: [{"agent_id":"string","agent_name":"string","failure_probability":number,"predicted_failure_type":"disk_full"|"memory_exhaustion"|"cpu_overload"|"service_crash","time_horizon_hours":number,"contributing_factors":["string"],"recommendation":"string"}]`;
    const userPrompt = `Agentes em risco para ${tenant.name}:\n${riskyAgents.slice(0, 10).map(a => `- ${a.name} (${a.status}): CPU avg=${a.avg_cpu}% max=${a.max_cpu}% trend=${a.cpu_trend}, MEM avg=${a.avg_mem}% max=${a.max_mem}% trend=${a.mem_trend}, DISCO avg=${a.avg_disk}% max=${a.max_disk}% trend=${a.disk_trend}`).join('\n')}`;

    const { data: predictions } = await callAIJson<PredictionResult[]>(systemPrompt, userPrompt, { maxTokens: 1024, functionName: 'ai-predict-agent-failure', tenantId: tenant.id });
    if (predictions && Array.isArray(predictions)) {
      const insights = predictions.filter(p => p.failure_probability > 0.5).map(p => ({
        tenant_id: tenant.id, insight_type: 'prediction',
        severity: p.failure_probability > 0.8 ? 'critical' : 'warning',
        title: `Previsao: ${p.agent_name} pode falhar em ${p.time_horizon_hours}h`,
        description: `Probabilidade: ${Math.round(p.failure_probability * 100)}%. Fatores: ${p.contributing_factors.join(', ')}`,
        evidence: { prediction: p, analysis_type: 'trend_based' },
        recommendation: p.recommendation, confidence_score: p.failure_probability,
      }));
      if (insights.length > 0) await supabase.from('ai_insights').insert(insights);
      allPredictions.push(...predictions);
    }
  }

  return { success: true, predictions: allPredictions, timestamp: new Date().toISOString() };
});
