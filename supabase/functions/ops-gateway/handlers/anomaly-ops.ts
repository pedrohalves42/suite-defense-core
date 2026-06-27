/**
 * Behavioral anomaly detection handler.
 * Inlined from ai-behavioral-anomaly-detector (Phase 1B).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { callAIJson } from '../../_shared/ai-provider-helper.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
}).passthrough();

interface DetectedAnomaly {
  agent: string;
  metric: string;
  current: number;
  mean: number;
  std: number;
  multiplier: number;
  deviation: number;
}

interface MetricRow {
  agent_id: string;
  cpu_usage_percent?: number;
  memory_usage_percent?: number;
  disk_usage_percent?: number;
}

interface BaselineRow {
  agent_id: string;
  baseline_type: string;
  mean_value: number | null;
  std_deviation: number | null;
  threshold_multiplier: number | null;
}

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

function groupMetricsByAgent(metrics: MetricRow[]): Map<string, MetricRow[]> {
  const map = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    if (!map.has(m.agent_id)) map.set(m.agent_id, []);
    map.get(m.agent_id)!.push(m);
  }
  return map;
}

function detectStatisticalAnomalies(
  baselines: BaselineRow[],
  metricsByAgent: Map<string, MetricRow[]>,
  agentMap: Map<string, string>,
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  for (const baseline of baselines) {
    const agentMetrics = metricsByAgent.get(baseline.agent_id);
    if (!agentMetrics || agentMetrics.length === 0) continue;
    if (baseline.mean_value == null || baseline.std_deviation == null) continue;

    const multiplier = baseline.threshold_multiplier || 2;
    const threshold = baseline.mean_value + (multiplier * baseline.std_deviation);

    let currentValues: number[] = [];
    switch (baseline.baseline_type) {
      case 'cpu_usage':
        currentValues = agentMetrics.map(m => m.cpu_usage_percent).filter((v): v is number => v != null);
        break;
      case 'memory_usage':
        currentValues = agentMetrics.map(m => m.memory_usage_percent).filter((v): v is number => v != null);
        break;
      case 'disk_usage':
        currentValues = agentMetrics.map(m => m.disk_usage_percent).filter((v): v is number => v != null);
        break;
    }

    if (currentValues.length === 0) continue;
    const currentAvg = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;

    if (currentAvg > threshold) {
      const deviation = baseline.std_deviation > 0
        ? ((currentAvg - baseline.mean_value) / baseline.std_deviation) * 100
        : 100;

      anomalies.push({
        agent: agentMap.get(baseline.agent_id) || baseline.agent_id,
        metric: baseline.baseline_type,
        current: Math.round(currentAvg * 10) / 10,
        mean: Math.round(baseline.mean_value * 10) / 10,
        std: Math.round(baseline.std_deviation * 10) / 10,
        multiplier,
        deviation: Math.round(deviation),
      });
    }
  }

  return anomalies;
}

export async function handleAiBehavioralAnomalyDetector(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    return { success: false, error: 'SYSTEM_HALTED', __status: 503 };
  }

  const parsed = BodySchema.safeParse(payload || {});
  if (!parsed.success) {
    return { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors, __status: 400 };
  }
  const tenantId = parsed.data.tenant_id;

  let tenantsQuery = supabase.from('tenants').select('id, name');
  if (tenantId) tenantsQuery = tenantsQuery.eq('id', tenantId);
  const { data: tenants } = await tenantsQuery;

  if (!tenants || tenants.length === 0) {
    return { success: true, anomalies: [] };
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

    const metricsByAgent = groupMetricsByAgent(recentMetrics as MetricRow[]);
    const detectedAnomalies = detectStatisticalAnomalies(baselines as BaselineRow[], metricsByAgent, agentMap);
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

  return { success: true, anomalies: allAnomalies, timestamp: new Date().toISOString() };
}