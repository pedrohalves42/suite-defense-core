/**
 * Check analytics — Heavy/AI inlined handlers (Sub-batch 2C-3)
 * sli-collector (with bug fix), analyze-confidence-gap-trend, analyze-network-anomalies
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

type SB = any;

// ═══ sli-collector ═══
const SLI_TARGETS = {
  availability: { target: 99.9, warning: 99.5 },
  latency: { target: 500, warning: 1000 },
  throughput: { target: 10000, warning: 8000 },
  errorRate: { target: 0.1, warning: 0.5 },
};

export async function handleSliCollector(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const action = (payload.action as string) || 'dashboard';
  const tenantId = (payload.tenantId as string) || 'global';
  const endpoint = payload.endpoint as string | undefined;
  const statusCode = payload.statusCode as number | undefined;
  const latencyMs = payload.latencyMs as number | undefined;

  // ═══ RECORD METRIC ═══
  if (action === 'record') {
    if (!endpoint || statusCode === undefined) return { error: 'endpoint and statusCode required' };

    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    const hourStr = hourStart.toISOString();
    const isSuccess = statusCode >= 200 && statusCode < 400;
    const isError = statusCode >= 500;

    const { data: existing } = await supabase.from('sli_metrics_hourly').select('id, total_requests, success_requests, error_requests, total_latency_ms, max_latency_ms, min_latency_ms').eq('tenant_id', tenantId).eq('endpoint', endpoint).eq('hour', hourStr).maybeSingle();

    if (existing) {
      await supabase.from('sli_metrics_hourly').update({ total_requests: existing.total_requests + 1, success_requests: existing.success_requests + (isSuccess ? 1 : 0), error_requests: existing.error_requests + (isError ? 1 : 0), total_latency_ms: existing.total_latency_ms + (latencyMs || 0), max_latency_ms: Math.max(existing.max_latency_ms, latencyMs || 0), min_latency_ms: Math.min(existing.min_latency_ms || 999999, latencyMs || 0), updated_at: now.toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('sli_metrics_hourly').insert({ tenant_id: tenantId, endpoint, hour: hourStr, total_requests: 1, success_requests: isSuccess ? 1 : 0, error_requests: isError ? 1 : 0, total_latency_ms: latencyMs || 0, max_latency_ms: latencyMs || 0, min_latency_ms: latencyMs || 0 });
    }

    if (isError) {
      await supabase.from('slo_error_budget_events').insert({ tenant_id: tenantId, endpoint, status_code: statusCode, error_budget_consumed: 1, timestamp: now.toISOString() });
    }

    return { success: true };
  }

  // ═══ GET SLI ═══
  if (action === 'sli') {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data: metrics } = await supabase.from('sli_metrics_hourly').select('total_requests, success_requests, error_requests, total_latency_ms, max_latency_ms').eq('tenant_id', tenantId).gte('hour', startOfDay.toISOString());

    const m = metrics || [];
    const totalReqs = m.reduce((s, r) => s + r.total_requests, 0);
    const successReqs = m.reduce((s, r) => s + r.success_requests, 0);
    const errorReqs = m.reduce((s, r) => s + r.error_requests, 0);
    const totalLatency = m.reduce((s, r) => s + r.total_latency_ms, 0);
    const availability = totalReqs > 0 ? (successReqs / totalReqs) * 100 : 100;
    const avgLatency = totalReqs > 0 ? totalLatency / totalReqs : 0;
    const errorRate = totalReqs > 0 ? (errorReqs / totalReqs) * 100 : 0;
    const throughput = totalReqs / Math.max(m.length, 1);

    const status = (val: number, target: number, warning: number, higherIsBetter = true) => higherIsBetter ? (val >= target ? 'healthy' : val >= warning ? 'warning' : 'critical') : (val <= target ? 'healthy' : val <= warning ? 'warning' : 'critical');

    return {
      availability: { current: +availability.toFixed(2), target: SLI_TARGETS.availability.target, status: status(availability, 99.9, 99.5) },
      latency: { current: Math.round(avgLatency), target: SLI_TARGETS.latency.target, status: status(avgLatency, 500, 1000, false) },
      throughput: { current: Math.round(throughput), target: SLI_TARGETS.throughput.target, status: status(throughput, 10000, 8000) },
      errorRate: { current: +errorRate.toFixed(2), target: SLI_TARGETS.errorRate.target, status: status(errorRate, 0.1, 0.5, false) },
    };
  }

  // ═══ GET SLO ═══
  if (action === 'slo') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await supabase.from('slo_error_budget_events').select('timestamp').eq('tenant_id', tenantId).gte('timestamp', thirtyDaysAgo);
    const { data: metricsSummary } = await supabase.from('sli_metrics_hourly').select('total_requests').eq('tenant_id', tenantId).gte('hour', thirtyDaysAgo);

    const totalReqs = metricsSummary?.reduce((s, r) => s + r.total_requests, 0) || 0;
    const totalErrors = events?.length || 0;
    const maxAllowedErrors = totalReqs * (SLI_TARGETS.errorRate.target / 100);
    const spent = maxAllowedErrors > 0 ? (totalErrors / maxAllowedErrors) * 100 : 0;
    const remaining = Math.max(0, 100 - spent);
    const hourEvents = events?.filter(e => new Date(e.timestamp).getTime() > Date.now() - 3600000).length || 0;
    const dailyAvg = totalErrors / 30;
    const burnRate = dailyAvg > 0 ? (hourEvents * 24) / dailyAvg : 0;
    const hourlyRate = totalErrors / (30 * 24);
    const hoursToExhaustion = hourlyRate > 0 ? Math.floor((maxAllowedErrors - totalErrors) / hourlyRate) : null;

    return { errorBudget: { total: SLI_TARGETS.errorRate.target, spent: +spent.toFixed(1), remaining: +remaining.toFixed(1), status: remaining > 50 ? 'healthy' : remaining > 20 ? 'warning' : 'critical' }, burnRate: +burnRate.toFixed(2), estimatedTimeToExhaustion: hoursToExhaustion };
  }

  // ═══ DASHBOARD (default) ═══
  const { data: recentMetrics } = await supabase.from('sli_metrics_hourly').select('id, tenant_id, hour, metric_name, metric_value, target_value, is_within_slo').eq('tenant_id', tenantId).order('hour', { ascending: false }).limit(168);
  return { recentMetrics: recentMetrics || [], timestamp: new Date().toISOString() };
}

// ═══ analyze-confidence-gap-trend ═══
interface GapTrendAnalysis {
  tenant_id: string; current_gap: number; avg_gap_30d: number;
  is_improving: boolean; worst_dimension: string | null;
  worst_dimension_gap: number; consecutive_alerts: number; alert_triggered: boolean;
}

export async function handleAnalyzeConfidenceGapTrend(supabase: SB, _requestId: string, _payload: Record<string, unknown>) {
  logger.info('[analyze-confidence-gap-trend] Starting trend analysis...');

  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, name');
  if (tenantsError) throw tenantsError;

  const analyses: GapTrendAnalysis[] = [];

  for (const tenant of tenants || []) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: gapHistory, error: gapError } = await supabase
      .from('audit_confidence_gaps').select('id, tenant_id, confidence_gap, dimension_gaps, calculated_at')
      .eq('tenant_id', tenant.id).gte('calculated_at', thirtyDaysAgo)
      .order('calculated_at', { ascending: false });

    if (gapError) { logger.error(`Error fetching gap history for tenant ${tenant.id}:`, gapError); continue; }
    if (!gapHistory || gapHistory.length === 0) continue;

    const currentGap = gapHistory[0].confidence_gap;
    const avgGap30d = gapHistory.reduce((sum: number, g: Record<string, number>) => sum + g.confidence_gap, 0) / gapHistory.length;

    let isImproving = false;
    if (gapHistory.length >= 3) {
      const recentAvg = (gapHistory[0].confidence_gap + gapHistory[1].confidence_gap + gapHistory[2].confidence_gap) / 3;
      const oldAvg = gapHistory.length >= 6
        ? (gapHistory[3].confidence_gap + gapHistory[4].confidence_gap + gapHistory[5].confidence_gap) / 3
        : avgGap30d;
      isImproving = recentAvg < oldAvg - 2;
    }

    const worstDimension = gapHistory[0].worst_dimension as string | null;
    const worstDimensionGap = gapHistory[0].worst_gap || 0;

    let consecutiveAlerts = 0;
    for (let i = 0; i < gapHistory.length - 1; i++) {
      if (gapHistory[i].confidence_gap > gapHistory[i + 1].confidence_gap) consecutiveAlerts++;
      else break;
    }

    const alertTriggered = consecutiveAlerts >= 3 || currentGap > 10 || (worstDimensionGap && Math.abs(worstDimensionGap) > 15);

    analyses.push({ tenant_id: tenant.id, current_gap: currentGap, avg_gap_30d: avgGap30d, is_improving: isImproving, worst_dimension: worstDimension, worst_dimension_gap: worstDimensionGap, consecutive_alerts: consecutiveAlerts, alert_triggered: !!alertTriggered });

    if (alertTriggered) {
      const insightTitle = consecutiveAlerts >= 3
        ? `Gap de Confianca em Degradacao Continua (${consecutiveAlerts} vezes)`
        : currentGap > 10
        ? `Gap de Confianca Critico: ${currentGap.toFixed(1)} pontos`
        : `Dimensao ${worstDimension} com Gap Critico: ${Math.abs(worstDimensionGap).toFixed(1)} pontos`;

      const dimensionLabels: Record<string, string> = {
        data_protection: 'Protecao de Dados', access_control: 'Controle de Acesso',
        audit_logging: 'Logs de Auditoria', vulnerability_management: 'Gestao de Vulnerabilidades',
        incident_response: 'Resposta a Incidentes', compliance: 'Conformidade',
        network_security: 'Seguranca de Rede', endpoint_protection: 'Protecao de Endpoints',
        cross_tenant_isolation: 'Isolamento Multi-tenant',
      };

      const suggestedAction = worstDimension
        ? `Focar melhorias em ${dimensionLabels[worstDimension] || worstDimension}. Executar auditoria detalhada nesta dimensao.`
        : 'Executar auditoria completa Ana + Red Team para identificar gaps especificos.';

      await supabase.from('ai_insights').insert({
        tenant_id: tenant.id, insight_type: 'compliance',
        severity: currentGap > 10 ? 'critical' : 'high',
        title: insightTitle,
        description: `A diferenca entre a avaliacao interna (Ana) e adversarial (Red Team) esta em ${currentGap.toFixed(1)} pontos. Tendencia: ${isImproving ? 'melhorando' : 'estavel ou piorando'}.`,
        evidence: { analysis: analyses[analyses.length - 1], recommendation: suggestedAction },
        suggested_action: suggestedAction,
      });
    }
  }

  return {
    success: true,
    analyses,
    summary: {
      tenants_analyzed: analyses.length,
      alerts_triggered: analyses.filter(a => a.alert_triggered).length,
      improving: analyses.filter(a => a.is_improving).length,
      not_improving: analyses.filter(a => !a.is_improving).length,
    },
  };
}

// ═══ analyze-network-anomalies ═══
export async function handleAnalyzeNetworkAnomalies(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  // Lazy imports for AI dependencies
  const { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName } = await import('../../_shared/ai-sanitizer.ts');
  const { callAISimple } = await import('../../_shared/ai-provider-helper.ts');
  const { buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources } = await import('../../_shared/ai-evidence-types.ts');
  type AIEvidence = Awaited<ReturnType<typeof import('../../_shared/ai-evidence-types.ts')>>['AIEvidence'] extends never ? { data_point: string; source: string; value: unknown; context?: string; severity?: string } : { data_point: string; source: string; value: unknown; context?: string; severity?: string };

  const agentName = payload.agentName as string | undefined;
  const timeRangeHours = (payload.timeRangeHours as number) || 24;
  const startTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

  let agentsQuery = supabase.from('agents').select('agent_name, status, last_heartbeat, enrolled_at').gte('last_heartbeat', startTime);
  if (agentName) agentsQuery = agentsQuery.eq('agent_name', agentName);

  const { data: agents, error: agentsError } = await agentsQuery;
  if (agentsError) {
    logger.error('Error fetching agents:', agentsError);
    return { error: 'Erro ao buscar dados dos agentes' };
  }

  let jobsQuery = supabase.from('jobs').select('agent_name, type, status, created_at, completed_at').gte('created_at', startTime).limit(1000);
  if (agentName) jobsQuery = jobsQuery.eq('agent_name', agentName);

  const { data: jobs, error: jobsError } = await jobsQuery;
  if (jobsError) {
    logger.error('Error fetching jobs:', jobsError);
    return { error: 'Erro ao buscar dados dos jobs' };
  }

  const anonymizedAgents = agents?.map(a => ({
    agent_id: anonymizeAgentName(a.agent_name),
    status: a.status, last_heartbeat: a.last_heartbeat, enrolled_at: a.enrolled_at,
  })) || [];

  const anonymizedJobs = jobs?.map(j => ({
    agent_id: anonymizeAgentName(j.agent_name),
    type: j.type, status: j.status, created_at: j.created_at, completed_at: j.completed_at,
  })) || [];

  const analysisContext = {
    timeRange: `${timeRangeHours} horas`,
    totalAgents: agents?.length || 0,
    totalJobs: jobs?.length || 0,
    agents: anonymizedAgents,
    jobs: anonymizedJobs.slice(0, 100),
    statistics: {
      jobsByStatus: jobs?.reduce((acc: Record<string, number>, job) => { acc[job.status] = (acc[job.status] || 0) + 1; return acc; }, {}),
      jobsByType: jobs?.reduce((acc: Record<string, number>, job) => { acc[job.type] = (acc[job.type] || 0) + 1; return acc; }, {}),
      agentsByStatus: agents?.reduce((acc: Record<string, number>, agent) => { acc[agent.status] = (acc[agent.status] || 0) + 1; return acc; }, {}),
    }
  };

  const { sanitized: sanitizedContext, warnings } = sanitizeObjectForAI(analysisContext);
  if (warnings.length > 0) logger.warn('[analyze-network-anomalies] Sanitization warnings:', warnings);

  const rawPrompt = `Voce e um especialista em seguranca de rede e analise de comportamento de sistemas.

Analise os seguintes dados de uma rede de seguranca de endpoints e identifique possiveis anomalias, problemas ou padroes suspeitos:

${JSON.stringify(sanitizedContext, null, 2)}

Forneca uma analise detalhada incluindo:
1. **Resumo Executivo**: Visao geral do estado da rede
2. **Anomalias Detectadas**: Liste qualquer comportamento anormal ou suspeito
3. **Padroes Identificados**: Tendencias nos dados
4. **Alertas Criticos**: Problemas que requerem atencao imediata
5. **Recomendacoes**: Acoes sugeridas para melhorar a seguranca

Seja especifico e tecnico, focando em seguranca cibernetica.`;

  const promptSanitizeResult = sanitizeForAI(rawPrompt);
  if (promptSanitizeResult.blocked) logger.warn('[analyze-network-anomalies] Prompt injection blocked:', promptSanitizeResult.blockedPatterns);
  const aiPrompt = promptSanitizeResult.sanitized;

  const aiResult = await callAISimple(
    'Voce e um especialista em seguranca de rede e deteccao de anomalias.',
    aiPrompt,
    { maxTokens: 2000, functionName: 'analyze-network-anomalies' }
  );

  if (!aiResult.success) {
    logger.error('[analyze-network-anomalies] AI call failed:', aiResult.error);
    return { error: 'Erro ao analisar dados com IA - servico temporariamente indisponivel', rawData: analysisContext, fallback: true, provider: aiResult.provider };
  }

  const analysis = aiResult.content;
  logger.info(`[analyze-network-anomalies] Analysis completed via ${aiResult.provider} in ${aiResult.latencyMs}ms`);

  const evidenceArray: AIEvidence[] = [];

  if (agents && agents.length > 0) {
    evidenceArray.push(buildEvidence('Total de Agentes Analisados', 'agents', agents.length, undefined, 'info'));
    const offlineAgents = agents.length - agents.filter(a => a.status === 'online').length;
    if (offlineAgents > 0) {
      evidenceArray.push(buildEvidence('Agentes Offline', 'agents', offlineAgents, undefined, offlineAgents > agents.length * 0.3 ? 'critical' : 'warning'));
    }
  }

  if (jobs && jobs.length > 0) {
    const failedJobs = jobs.filter(j => j.status === 'failed').length;
    if (failedJobs > 0) {
      evidenceArray.push(buildEvidence('Jobs com Falha', 'jobs', failedJobs, undefined, failedJobs > 10 ? 'critical' : 'warning'));
    }
    evidenceArray.push(buildEvidence('Total de Jobs Analisados', 'jobs', jobs.length, undefined, 'info'));
  }

  return {
    success: true,
    analysis,
    rawData: analysisContext,
    timestamp: new Date().toISOString(),
    evidence: evidenceArray,
    data_sources: extractDataSources(evidenceArray),
    reasoning_summary: generateReasoningSummary(evidenceArray, `analise de rede das ultimas ${timeRangeHours} horas`, 'Analise de comportamento de rede e deteccao de anomalias realizada pela IA.'),
    confidence: calculateConfidence(evidenceArray, true),
  };
}