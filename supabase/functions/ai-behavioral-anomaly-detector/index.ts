/**
 * ai-behavioral-anomaly-detector — Modularized
 * Module: anomaly-detector
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { detectStatisticalAnomalies, groupMetricsByAgent } from './anomaly-detector.ts';

interface AnomalyResult {
  agent_id: string;
  agent_name: string;
  anomaly_type: string;
  severity: 'info' | 'warning' | 'critical';
  deviation_percent: number;
  baseline_value: number;
  current_value: number;
  possible_cause: string;
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
      return new Response(JSON.stringify({ success: true, anomalies: [] }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const allAnomalies: AnomalyResult[] = [];

    for (const tenant of tenants) {
      const { data: baselines } = await supabase.from('agent_behavioral_baseline').select('agent_id, baseline_type, mean_value, std_deviation, threshold_multiplier').eq('tenant_id', tenant.id).eq('is_active', true);
      if (!baselines || baselines.length === 0) continue;

      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const agentIds = [...new Set(baselines.map(b => b.agent_id))];

      const { data: recentMetrics } = await supabase.from('agent_system_metrics_partitioned').select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, collected_at').eq('tenant_id', tenant.id).in('agent_id', agentIds).gte('collected_at', cutoff).order('collected_at', { ascending: false }).limit(500);
      if (!recentMetrics || recentMetrics.length === 0) continue;

      const { data: agents } = await supabase.from('agents').select('id, hostname, display_name, agent_name').in('id', agentIds);
      const agentMap = new Map((agents || []).map(a => [a.id, a.display_name || a.hostname || a.agent_name || a.id.slice(0, 8)]));

      const metricsByAgent = groupMetricsByAgent(recentMetrics);
      const detectedAnomalies = detectStatisticalAnomalies(baselines, metricsByAgent, agentMap);
      if (detectedAnomalies.length === 0) continue;

      const systemPrompt = `Voce e um especialista em deteccao de anomalias comportamentais em sistemas. Analise os desvios detectados e determine se sao problemas reais ou eventos normais (atualizacoes, backup, etc).

Responda APENAS com JSON valido no formato:
[{"agent_id":"string","agent_name":"string","anomaly_type":"security_threat"|"resource_exhaustion"|"maintenance_activity"|"software_update"|"unknown","severity":"info"|"warning"|"critical","deviation_percent":number,"baseline_value":number,"current_value":number,"possible_cause":"string","recommendation":"string"}]`;

      const userPrompt = `Anomalias detectadas para ${tenant.name}:\n\n${detectedAnomalies.map(a => `- ${a.agent}: ${a.metric} atual=${a.current}% (baseline: media=${a.mean}%, desvio=${a.std}%, threshold=${a.multiplier}σ) — desvio de ${a.deviation}%`).join('\n')}\n\nContextualize cada anomalia: e um problema real ou atividade normal?`;

      const { data: aiAnomalies } = await callAIJson<AnomalyResult[]>(systemPrompt, userPrompt, { maxTokens: 1024, functionName: 'ai-behavioral-anomaly-detector', tenantId: tenant.id });

      if (aiAnomalies && Array.isArray(aiAnomalies)) {
        const insights = aiAnomalies.filter(a => a.severity !== 'info' && a.anomaly_type !== 'maintenance_activity').map(a => ({
          tenant_id: tenant.id, insight_type: 'anomaly_detection' as const, severity: a.severity,
          title: `Anomalia: ${a.agent_name} - ${a.anomaly_type}`,
          description: `Desvio de ${a.deviation_percent}% no comportamento de ${a.agent_name}. ${a.possible_cause}`,
          evidence: { anomaly: a, detection_method: 'statistical_baseline' },
          recommendation: a.recommendation, confidence_score: Math.min(1, a.deviation_percent / 200),
        }));
        if (insights.length > 0) await supabase.from('ai_insights').insert(insights);
        allAnomalies.push(...aiAnomalies);
      }
    }

    return new Response(JSON.stringify({ success: true, anomalies: allAnomalies, timestamp: new Date().toISOString() }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    logger.error('[ai-behavioral-anomaly-detector] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
