/**
 * Quality rules: SILENT_FAILURE_007, JOB_SLOW_008,
 * INSIGHT_IGNORED_009, PROGRESSIVE_DEGRADATION_012
 */
import { logger } from '../../_shared/logger.ts';
import type { RuleResult, RuleRecord } from '../types.ts';

export async function processSilentFailureDetection(supabase: any, rule: RuleRecord): Promise<RuleResult> {
  logger.debug('[SILENT_FAILURE_007] Detecting silent job failures');

  const { data: failures, error } = await supabase
    .rpc('detect_silent_job_failures');

  if (error) {
    logger.error('[SILENT_FAILURE_007] Detection error:', error);
    throw error;
  }

  logger.debug(`[SILENT_FAILURE_007] Found ${failures?.length || 0} silent failures`);

  const agents: RuleResult['agents'] = [];
  const processedTenants = new Map<string, typeof failures>();

  for (const failure of failures || []) {
    const existing = processedTenants.get(failure.tenant_id) || [];
    existing.push(failure);
    processedTenants.set(failure.tenant_id, existing);
  }

  for (const [tenantId, tenantFailures] of processedTenants) {
    const actionsExecuted = [];

    const { error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      alert_type: 'job_integrity_violation',
      severity: 'critical',
      message: `${tenantFailures.length} jobs marcados como completed SEM efeito colateral real detectados`,
      data: {
        violations: tenantFailures.map((f: Record<string, unknown>) => ({
          job_id: f.job_id,
          job_type: f.job_type,
          agent_id: f.agent_id,
          agent_name: f.agent_name,
          completed_at: f.completed_at,
          violation_type: f.violation_type
        })),
        detected_at: new Date().toISOString(),
        rule_code: rule.code
      },
      resolved: false
    });

    actionsExecuted.push({
      type: 'CREATE_SYSTEM_ALERT',
      success: !alertError,
      error: alertError?.message
    });

    const firstFailure = tenantFailures[0];
    const { error: insightError } = await supabase.from('ai_insights').insert({
      tenant_id: tenantId,
      title: `Falhas silenciosas detectadas: ${tenantFailures.length} jobs`,
      description: `Jobs do tipo ${tenantFailures.map((f: Record<string, unknown>) => f.job_type).join(', ')} foram marcados como completed mas nao produziram dados esperados. Isso indica uma possivel falha no pipeline ou dados corrompidos.`,
      severity: 'high',
      insight_type: 'integrity_violation',
      evidence: {
        job_count: tenantFailures.length,
        job_types: [...new Set(tenantFailures.map((f: Record<string, unknown>) => f.job_type))],
        sample_job_id: firstFailure.job_id,
        detected_at: new Date().toISOString()
      },
      recommendation: 'Investigar logs do submit-job-result. Verificar se os agentes estao enviando dados corretamente. Considerar re-executar os jobs afetados.',
      acknowledged: false
    });

    actionsExecuted.push({
      type: 'CREATE_AI_INSIGHT',
      success: !insightError,
      error: insightError?.message
    });

    for (const failure of tenantFailures) {
      await supabase.from('decision_events').insert({
        tenant_id: tenantId,
        rule_code: rule.code,
        agent_id: failure.agent_id,
        agent_name: failure.agent_name || 'Unknown',
        action: 'DETECT_SILENT_FAILURE',
        decision_source: 'system',
        decision_type: 'autonomous',
        evidence: {
          job_id: failure.job_id,
          job_type: failure.job_type,
          completed_at: failure.completed_at,
          violation_type: failure.violation_type,
          detected_at: new Date().toISOString()
        },
        actions_executed: actionsExecuted
      });

      agents.push({
        agent_id: failure.agent_id,
        agent_name: failure.agent_name || 'Unknown',
        action: 'DETECT_SILENT_FAILURE',
        reason: `Job ${failure.job_type} (${failure.job_id}) completed sem dados`
      });
    }

    logger.debug(`[SILENT_FAILURE_007] Created alerts for tenant ${tenantId} with ${tenantFailures.length} violations`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processSlowJobsRule(supabase: any, rule: RuleRecord): Promise<RuleResult> {
  logger.debug('[JOB_SLOW_008] Detecting systematically slow jobs');

  const { data: slowJobs, error } = await supabase.rpc('detect_slow_jobs', {
    p_time_window_hours: 24,
    p_min_occurrences: 3
  });

  if (error) {
    logger.debug('[JOB_SLOW_008] RPC not available, using fallback query');

    const { data: fallbackData } = await supabase
      .from('jobs')
      .select('id, agent_id, agent_name, tenant_id, type, created_at, completed_at, delivered_at')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .not('completed_at', 'is', null)
      .not('delivered_at', 'is', null)
      .limit(500);

    const jobsByType = new Map<string, number[]>();
    for (const job of fallbackData || []) {
      const execTime = new Date(job.completed_at).getTime() - new Date(job.delivered_at).getTime();
      if (!jobsByType.has(job.type)) jobsByType.set(job.type, []);
      jobsByType.get(job.type)!.push(execTime);
    }

    const slowTypes: RuleResult['agents'] = [];
    for (const [jobType, times] of jobsByType) {
      if (times.length >= 3) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        if (avg > 5 * 60 * 1000) {
          slowTypes.push({
            agent_id: 'system',
            agent_name: jobType,
            action: 'CREATE_AI_INSIGHT',
            reason: `Job type ${jobType} avg execution: ${Math.round(avg / 1000 / 60)}min`
          });
        }
      }
    }

    if (slowTypes.length > 0) {
      const firstTenant = fallbackData?.[0]?.tenant_id;
      if (firstTenant) {
        await supabase.from('ai_insights').insert({
          tenant_id: firstTenant,
          title: `Jobs sistematicamente lentos detectados`,
          description: `${slowTypes.length} tipos de jobs estao consistentemente lentos: ${slowTypes.map(s => s.agent_name).join(', ')}`,
          severity: 'medium',
          insight_type: 'job_performance',
          evidence: { slow_job_types: slowTypes },
          recommendation: 'Considere otimizar os scripts dos jobs ou dividir em subtarefas menores.',
          acknowledged: false
        });
      }
    }

    return { rule_code: rule.code, processed_count: slowTypes.length, agents: slowTypes };
  }

  logger.debug(`[JOB_SLOW_008] Found ${slowJobs?.length || 0} slow job patterns`);
  return { rule_code: rule.code, processed_count: slowJobs?.length || 0, agents: [] };
}

export async function processIgnoredInsightsRule(supabase: any, rule: RuleRecord): Promise<RuleResult> {
  logger.debug('[INSIGHT_IGNORED_009] Checking ignored critical insights');

  const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: ignoredInsights, error } = await supabase
    .from('ai_insights')
    .select('id, tenant_id, title, severity, created_at')
    .in('severity', ['critical', 'high'])
    .eq('acknowledged', false)
    .lt('created_at', cutoffDate)
    .not('title', 'ilike', '%[ESCALADO]%')
    .limit(50);

  if (error) {
    logger.error('[INSIGHT_IGNORED_009] Query error:', error);
    throw error;
  }

  logger.debug(`[INSIGHT_IGNORED_009] Found ${ignoredInsights?.length || 0} ignored insights`);

  const agents: RuleResult['agents'] = [];

  for (const insight of ignoredInsights || []) {
    const { error: updateError } = await supabase
      .from('ai_insights')
      .update({
        severity: 'critical',
        title: `[ESCALADO] ${insight.title}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', insight.id);

    if (updateError) {
      logger.error(`[INSIGHT_IGNORED_009] Error escalating insight ${insight.id}:`, updateError);
      continue;
    }

    await supabase.from('decision_events').insert({
      tenant_id: insight.tenant_id,
      rule_code: rule.code,
      action: 'ESCALATE_INSIGHT',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        insight_id: insight.id,
        original_severity: insight.severity,
        original_created_at: insight.created_at,
        escalated_at: new Date().toISOString(),
        hours_ignored: Math.round((Date.now() - new Date(insight.created_at).getTime()) / (60 * 60 * 1000))
      },
      actions_executed: [{ type: 'ESCALATE_INSIGHT', success: true }]
    });

    agents.push({
      agent_id: insight.id,
      agent_name: insight.title.substring(0, 50),
      action: 'ESCALATE_INSIGHT',
      reason: `Ignorado por ${Math.round((Date.now() - new Date(insight.created_at).getTime()) / (60 * 60 * 1000))}h`
    });

    logger.debug(`[INSIGHT_IGNORED_009] Escalated insight: ${insight.title}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processProgressiveDegradationRule(supabase: any, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    min_trend_duration_hours: 12,
    degradation_threshold_percent: 20
  };

  logger.debug('[PROGRESSIVE_DEGRADATION_012] Detecting progressive degradation');

  const now = Date.now();
  const trendHours = conditions.min_trend_duration_hours as number;
  const oldCutoff = new Date(now - trendHours * 60 * 60 * 1000);
  const midpoint = new Date(now - (trendHours / 2) * 60 * 60 * 1000);

  const { data: oldJobs } = await supabase
    .from('jobs')
    .select('agent_id, tenant_id, status')
    .gte('created_at', oldCutoff.toISOString())
    .lt('created_at', midpoint.toISOString())
    .limit(2000);

  const { data: recentJobs } = await supabase
    .from('jobs')
    .select('agent_id, tenant_id, status')
    .gte('created_at', midpoint.toISOString())
    .limit(2000);

  const calcSuccessRate = (jobs: Array<Record<string, unknown>>) => {
    const agentRates = new Map<string, { success: number; total: number; tenant_id: string }>();
    for (const job of jobs || []) {
      const agentId = job.agent_id as string;
      if (!agentRates.has(agentId)) {
        agentRates.set(agentId, { success: 0, total: 0, tenant_id: job.tenant_id as string });
      }
      const ar = agentRates.get(agentId)!;
      ar.total++;
      if (job.status === 'completed') ar.success++;
    }
    return agentRates;
  };

  const oldRates = calcSuccessRate(oldJobs);
  const recentRates = calcSuccessRate(recentJobs);

  const degradingAgents: { agent_id: string; tenant_id: string; oldRate: number; newRate: number; degradation: number }[] = [];

  for (const [agentId, recent] of recentRates) {
    const old = oldRates.get(agentId);
    if (!old || old.total < 3 || recent.total < 3) continue;

    const oldRate = (old.success / old.total) * 100;
    const newRate = (recent.success / recent.total) * 100;
    const degradation = oldRate - newRate;

    if (degradation >= (conditions.degradation_threshold_percent as number)) {
      degradingAgents.push({ agent_id: agentId, tenant_id: recent.tenant_id, oldRate, newRate, degradation });
    }
  }

  logger.debug(`[PROGRESSIVE_DEGRADATION_012] Found ${degradingAgents.length} degrading agents`);

  const agents: RuleResult['agents'] = [];

  for (const degrading of degradingAgents.slice(0, 10)) {
    const { data: agentInfo } = await supabase
      .from('agents')
      .select('agent_name')
      .eq('id', degrading.agent_id)
      .single();

    const agentName = agentInfo?.agent_name || degrading.agent_id.substring(0, 8);

    await supabase.from('ai_insights').insert({
      tenant_id: degrading.tenant_id,
      title: `Degradacao progressiva: ${agentName}`,
      description: `O agente ${agentName} apresenta queda de ${degrading.degradation.toFixed(1)}% na taxa de sucesso (de ${degrading.oldRate.toFixed(1)}% para ${degrading.newRate.toFixed(1)}%).`,
      severity: 'high',
      insight_type: 'prediction',
      evidence: {
        old_success_rate: degrading.oldRate,
        new_success_rate: degrading.newRate,
        degradation_percent: degrading.degradation,
        trend_duration_hours: trendHours
      },
      recommendation: 'Investigar causa da degradacao antes que se torne critica. Verificar logs de erro e conectividade.',
      acknowledged: false
    });

    await supabase.from('decision_events').insert({
      tenant_id: degrading.tenant_id,
      rule_code: rule.code,
      agent_id: degrading.agent_id,
      agent_name: agentName,
      action: 'DETECT_DEGRADATION',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        old_success_rate: degrading.oldRate,
        new_success_rate: degrading.newRate,
        degradation_percent: degrading.degradation,
        detected_at: new Date().toISOString()
      },
      actions_executed: [{ type: 'CREATE_AI_INSIGHT', success: true }]
    });

    agents.push({
      agent_id: degrading.agent_id,
      agent_name: agentName,
      action: 'DETECT_DEGRADATION',
      reason: `Taxa de sucesso caiu ${degrading.degradation.toFixed(1)}%`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}
