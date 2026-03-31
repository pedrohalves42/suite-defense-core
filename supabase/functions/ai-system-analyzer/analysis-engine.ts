/**
 * AI analysis engine: builds prompts, calls AI, processes results
 */
import { sanitizeForAI } from '../_shared/ai-sanitizer.ts';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources, type AIEvidence } from '../_shared/ai-evidence-types.ts';
import { logger } from '../_shared/logger.ts';
import type { AnalysisData, AIInsight } from './types.ts';

export async function analyzeWithAI(
  tenantId: string,
  tenantName: string,
  data: AnalysisData,
  jobStats: Array<Record<string, unknown>>
): Promise<AIInsight[]> {
  try {
    const failureRate = data.installationStats.length > 0
      ? (data.failurePatterns.length / data.installationStats.length) * 100
      : 0;

    // Per-agent metrics analysis
    const agentMetricsMap = new Map<string, { cpu: number[]; memory: number[]; disk: number[]; friendly_name: string }>();

    for (const metric of data.agentMetrics) {
      const agentId = metric.agent_id;
      if (!agentMetricsMap.has(agentId)) {
        const friendlyName = metric.friendly_name || metric.agent_name || agentId.slice(0, 8);
        agentMetricsMap.set(agentId, { cpu: [], memory: [], disk: [], friendly_name: friendlyName });
      }
      const agentData = agentMetricsMap.get(agentId)!;
      if (metric.cpu_usage_percent != null) agentData.cpu.push(metric.cpu_usage_percent);
      if (metric.memory_usage_percent != null) agentData.memory.push(metric.memory_usage_percent);
      if (metric.disk_usage_percent != null) agentData.disk.push(metric.disk_usage_percent);
    }

    const agentSummaries = Array.from(agentMetricsMap.entries()).map(([agentId, d]) => {
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0;
      return {
        agent_id: agentId,
        agent_name: d.friendly_name,
        samples: d.cpu.length,
        avg_cpu: avg(d.cpu), avg_memory: avg(d.memory), avg_disk: avg(d.disk),
        max_cpu: max(d.cpu), max_memory: max(d.memory), max_disk: max(d.disk),
        high_cpu: max(d.cpu) > 90, high_memory: max(d.memory) > 85, critical_disk: max(d.disk) > 90,
      };
    });

    const problematicAgents = agentSummaries.filter(a => a.high_cpu || a.high_memory || a.critical_disk);

    const alertsByAgent = new Map<string, number>();
    for (const alert of data.systemAlerts) {
      if (alert.agent_id) {
        const agentData = agentMetricsMap.get(alert.agent_id);
        const friendlyName = agentData?.friendly_name || alert.agent_id.slice(0, 8);
        alertsByAgent.set(friendlyName, (alertsByAgent.get(friendlyName) || 0) + 1);
      } else {
        alertsByAgent.set('sistema', (alertsByAgent.get('sistema') || 0) + 1);
      }
    }

    const jobStatusCounts = jobStats.reduce((acc, job) => {
      acc[job.status as string] = (acc[job.status as string] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgCpuUsage = agentSummaries.length > 0 ? agentSummaries.reduce((sum, a) => sum + a.avg_cpu, 0) / agentSummaries.length : 0;
    const avgMemoryUsage = agentSummaries.length > 0 ? agentSummaries.reduce((sum, a) => sum + a.avg_memory, 0) / agentSummaries.length : 0;
    const displayTenantName = tenantName || 'Empresa';

    const rawPrompt = `Voce e um especialista em analise de sistemas de monitoramento de computadores. Analise os dados abaixo e identifique problemas, anomalias, e oportunidades de otimizacao.

**IMPORTANTE:** Analise CADA COMPUTADOR individualmente. Nao se deixe enganar por medias globais baixas - pode haver computadores especificos com problemas criticos.

**Dados da Empresa: ${displayTenantName}**

**Resumo Global (use apenas como contexto):**
- CPU media global: ${avgCpuUsage.toFixed(1)}%
- Memoria media global: ${avgMemoryUsage.toFixed(1)}%
- Total de agentes: ${agentSummaries.length}

**Analise POR AGENTE (PRIORIDADE):**
${agentSummaries.slice(0, 10).map(a =>
  `- ${a.agent_name}: CPU max=${a.max_cpu.toFixed(1)}% avg=${a.avg_cpu.toFixed(1)}%, Mem max=${a.max_memory.toFixed(1)}% avg=${a.avg_memory.toFixed(1)}%, Disco max=${a.max_disk.toFixed(1)}% (${a.samples} amostras)${a.high_cpu ? ' [WARN] CPU' : ''}${a.high_memory ? ' [WARN] MEM' : ''}${a.critical_disk ? ' DISCO' : ''}`
).join('\n')}

**Agentes Problematicos Identificados:** ${problematicAgents.length}
${problematicAgents.map(a => `- ${a.agent_name}: ${a.critical_disk ? 'DISCO CRITICO ' + a.max_disk.toFixed(1) + '%' : ''}${a.high_memory ? 'MEMORIA ALTA ' + a.max_memory.toFixed(1) + '%' : ''}${a.high_cpu ? 'CPU ALTA ' + a.max_cpu.toFixed(1) + '%' : ''}`).join('\n')}

**Alertas por Agente:**
${Array.from(alertsByAgent.entries()).slice(0, 5).map(([anonName, count]) => `- ${anonName}: ${count} alertas`).join('\n')}

**Metricas de Instalacao (ultimos 7 dias):**
- Total de tentativas: ${data.installationStats.length}
- Falhas: ${data.failurePatterns.length}
- Taxa de falha: ${failureRate.toFixed(1)}%

**Jobs Problematicos:**
- Total: ${data.problematicJobs.length}
- Status: ${JSON.stringify(jobStatusCounts)}

**Alertas do Sistema:**
- Total: ${data.systemAlerts.length}
- Criticos: ${data.systemAlerts.filter(a => a.severity === 'critical').length}

**Sua tarefa:**
1. Identifique ate 3 insights mais relevantes, PRIORIZANDO agentes especificos com problemas
2. Para cada insight, retorne um objeto JSON com:
   - insight_type: 'anomaly_detection', 'optimization', 'prediction', ou 'root_cause'
   - severity: 'info', 'warning', ou 'critical'
   - title: titulo curto e descritivo (INCLUA nome do agente se for problema especifico)
   - description: descricao detalhada do problema (2-3 frases)
   - recommendation: recomendacao clara de acao
   - confidence_score: valor entre 0.0 e 1.0

Responda APENAS com um array JSON valido de insights. Exemplo:
[
  {
    "insight_type": "root_cause",
    "severity": "critical",
    "title": "Disco critico no agente PC-Finance",
    "description": "O agente PC-Finance esta com 95.2% de uso de disco, gerando 18 alertas criticos nas ultimas 24h. Isso pode causar falha do sistema.",
    "recommendation": "Liberar espaco em disco imediatamente: limpar logs antigos, arquivos temporarios, e downloads.",
    "confidence_score": 0.95
  }
]`;

    const promptSanitizeResult = sanitizeForAI(rawPrompt);
    if (promptSanitizeResult.blocked) {
      logger.warn('[ai-system-analyzer] Prompt injection blocked for tenant:', tenantId, promptSanitizeResult.blockedPatterns);
    }
    const prompt = promptSanitizeResult.sanitized;

    const systemPrompt = 'Voce e um especialista em analise de sistemas. Responda APENAS com JSON valido, sem texto adicional.';

    // deno-lint-ignore no-explicit-any
    const { data: parsedInsights, result: aiResult } = await callAIJson<any[]>(
      systemPrompt, prompt,
      { maxTokens: 2048, functionName: 'ai-system-analyzer', tenantId }
    );

    if (!aiResult.success || !parsedInsights) {
      logger.error('[ai-system-analyzer] AI call failed for tenant:', tenantId, aiResult.error);
      return [];
    }

    logger.info(`[ai-system-analyzer] Analysis for ${tenantName} completed via ${aiResult.provider} in ${aiResult.latencyMs}ms`);

    if (!Array.isArray(parsedInsights)) {
      logger.error('[ai-system-analyzer] AI response is not an array');
      return [];
    }

    // Build evidence
    const evidenceArray: AIEvidence[] = [];
    if (failureRate > 0) evidenceArray.push(buildEvidence('Taxa de Falha de Instalacao', 'installation_analytics', failureRate, undefined, failureRate > 10 ? 'critical' : failureRate > 5 ? 'warning' : 'info'));
    if (avgCpuUsage > 0) evidenceArray.push(buildEvidence('Uso Medio de CPU', 'agent_system_metrics_partitioned', avgCpuUsage, undefined, avgCpuUsage > 80 ? 'critical' : avgCpuUsage > 60 ? 'warning' : 'info'));
    if (avgMemoryUsage > 0) evidenceArray.push(buildEvidence('Uso Medio de Memoria', 'agent_system_metrics_partitioned', avgMemoryUsage, undefined, avgMemoryUsage > 85 ? 'critical' : avgMemoryUsage > 70 ? 'warning' : 'info'));
    if (data.problematicJobs.length > 0) evidenceArray.push(buildEvidence('Jobs Problematicos', 'v_problematic_jobs', data.problematicJobs.length, undefined, data.problematicJobs.length > 10 ? 'critical' : 'warning'));
    const criticalAlerts = data.systemAlerts.filter(a => a.severity === 'critical').length;
    if (criticalAlerts > 0) evidenceArray.push(buildEvidence('Alertas Criticos', 'system_alerts', criticalAlerts, undefined, 'critical'));
    for (const agent of problematicAgents.slice(0, 3)) {
      evidenceArray.push(buildEvidence(`Agente com Problema: ${agent.agent_name}`, 'agent_system_metrics_partitioned', { cpu: agent.max_cpu, memory: agent.max_memory, disk: agent.max_disk }, undefined, agent.critical_disk ? 'critical' : 'warning'));
    }

    const data_sources = extractDataSources(evidenceArray);
    const confidence = calculateConfidence(evidenceArray, true);
    const reasoning_summary = generateReasoningSummary(evidenceArray, `analise do tenant ${tenantName}`, 'Correlacao automatica de metricas, jobs e alertas realizada pela IA.');

    return parsedInsights.map((insight: Record<string, unknown>) => ({
      tenant_id: tenantId,
      insight_type: insight.insight_type as AIInsight['insight_type'],
      severity: insight.severity as AIInsight['severity'],
      title: (insight.title as string) || '',
      description: (insight.description as string) || '',
      evidence: {
        failureRate, avgCpuUsage, avgMemoryUsage,
        problematicJobsCount: data.problematicJobs.length,
        systemAlertsCount: data.systemAlerts.length,
        analysisDate: new Date().toISOString(),
        evidence_pack: evidenceArray,
        data_sources,
        reasoning_summary,
      },
      recommendation: (insight.recommendation as string) || '',
      confidence_score: (insight.confidence_score as number) || confidence,
    }));

  } catch (error) {
    logger.error('[ai-system-analyzer] Error in AI analysis:', error);
    return [];
  }
}

export async function generateSuggestedActions(insights: Array<Record<string, unknown>>) {
  const actions: Array<Record<string, unknown>> = [];

  for (const insight of insights) {
    if (!['high', 'critical'].includes(insight.severity as string)) continue;

    let actionType: string | null = null;
    let actionPayload: Record<string, unknown> = {};
    const evidence = insight.evidence as Record<string, unknown> | undefined;

    switch (insight.insight_type) {
      case 'agent_health':
      case 'performance_degradation': {
        const agentName = evidence?.agent_name;
        if (agentName) {
          actionType = 'create_diagnostic_job';
          actionPayload = { agent_name: agentName, reason: insight.description, diagnostic_type: 'health_check' };
        }
        break;
      }
      case 'failure_pattern':
      case 'anomaly': {
        actionType = 'create_system_alert';
        actionPayload = { title: `AI Alert: ${insight.title}`, message: insight.description, severity: insight.severity === 'critical' ? 'critical' : 'high', evidence: insight.evidence };
        break;
      }
      case 'resource_exhaustion': {
        const agentName = evidence?.agent_name;
        if (agentName) {
          actionType = 'suggest_agent_restart';
          actionPayload = { agent_name: agentName, reason: insight.description, cpu_usage: evidence?.cpu_usage, memory_usage: evidence?.memory_usage };
        }
        break;
      }
      case 'stuck_jobs': {
        actionType = 'suggest_job_cleanup';
        actionPayload = { reason: insight.description, stuck_job_count: evidence?.stuck_job_count, recommendation: insight.recommendation };
        break;
      }
    }

    if (actionType) {
      actions.push({ insight_id: insight.id, tenant_id: insight.tenant_id, action_type: actionType, action_payload: actionPayload, status: 'pending' });
    }
  }

  return actions;
}
