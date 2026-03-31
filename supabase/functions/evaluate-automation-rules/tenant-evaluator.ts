import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
/**
 * Per-tenant evaluation with enterprise protection pipeline v2
 * Extracted from monolithic index.ts
 */
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import {
  evaluateOperator,
  isInCooldown,
  matchesScope,
  generateIdempotencyKey,
} from './helpers.ts';
import {
  runProtectionPipeline,
  logDecision,
  logExecution,
  createApprovalRequest,
  tryAcquireRuleLock,
} from './protection-pipeline.ts';
import {
  evaluateMetricThreshold,
  evaluateProcessAnomaly,
  evaluateAgentStatus,
  evaluateSecurityCheck,
  type TriggerCandidate,
} from './trigger-evaluators.ts';

async function executeAction(
  supabase: SupabaseClient,
  rule: Record<string, unknown>,
  agentId: string,
  tenantId: string,
  triggerData: Record<string, unknown>,
  agents: Array<Record<string, unknown>>
): Promise<{ status: string; result: Record<string, unknown> }> {
  const actionConfig = rule.action_config as Record<string, unknown>;

  try {
    if (rule.action_type === 'send_alert' || rule.action_type === 'create_alert') {
      const { data: alertData, error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          alert_type: 'automation_alert',
          severity: triggerData.value >= 95 ? 'critical' : 'high',
          title: `[Auto] ${rule.name}`,
          message: triggerData.message || `Rule triggered: ${JSON.stringify(triggerData)}`,
          details: { ...triggerData, rule_id: rule.id },
        })
        .select('id')
        .maybeSingle();

      if (alertError) throw new Error(alertError.message || JSON.stringify(alertError));

      // SOAR Bridge
      const triggerTypeMap: Record<string, string> = {
        'suspicious_process': 'suspicious_process',
        'agent_offline': 'agent_offline',
        'high_cpu': 'metric_threshold',
        'low_disk': 'metric_threshold',
      };
      const eventType = triggerData.event_type || rule.trigger_type;
      const playbookTrigger = triggerTypeMap[eventType];

      if (playbookTrigger) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';
          await fetchWithTimeout(`${supabaseUrl}/functions/v1/evaluate-playbook-triggers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret },
            body: JSON.stringify({
              tenant_id: tenantId,
              trigger_type: playbookTrigger,
              agent_id: agentId,
              context: { ...triggerData, source: 'automation_rule', rule_id: rule.id, process_reputation: triggerData.event_type === 'suspicious_process' ? 'malicious' : undefined },
            }),
          });
        } catch (bridgeErr) {
          logger.warn('[SOAR Bridge] Failed:', bridgeErr);
        }
      }

      return { status: 'executed', result: { alert_id: alertData?.id } };
    } else if (rule.action_type === 'create_job') {
      const agent = agents.find((a: Record<string, unknown>) => a.id === agentId);

      if (agent) {
        const { data: agentDetail } = await supabase
          .from('agents')
          .select('last_heartbeat, scheduling_paused')
          .eq('id', agentId)
          .maybeSingle();

        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const isOffline = !agentDetail?.last_heartbeat ||
          new Date(agentDetail.last_heartbeat) < twoHoursAgo ||
          agentDetail.scheduling_paused;

        if (isOffline) {
          const agentName = (agent as Record<string, unknown>).agent_name as string;
          logger.info(`[evaluate-automation-rules] Skipping job creation for offline agent ${agentName}`);
          return { status: 'skipped', result: { reason: 'agent_offline', agent_name: agentName } };
        }
      }

      const agentName = (agent as Record<string, unknown>)?.agent_name as string || 'Unknown';
      const jobType = (actionConfig as Record<string, unknown>)?.job_type as string || 'health_report';
      const actionParams = (actionConfig as Record<string, unknown>)?.params as Record<string, unknown> | undefined;

      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: jobType,
          status: 'queued',
          payload: { source: 'automation_rule', rule_id: rule.id, ...triggerData, ...actionParams },
        })
        .select('id')
        .maybeSingle();

      if (jobError) throw new Error(jobError.message || JSON.stringify(jobError));
      return { status: 'executed', result: { job_id: jobData?.id } };
    }

    return { status: 'skipped', result: { reason: `Unknown action: ${rule.action_type}` } };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { status: 'failed', result: { error: errMsg } };
  }
}

export async function evaluateForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ evaluated: number; triggered: number; blocked: number; decisions: number; risk_score?: number }> {
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (!rules || rules.length === 0) return { evaluated: 0, triggered: 0, blocked: 0, decisions: 0 };

  const { data: agents } = await supabase
    .from('agents')
    .select('id, agent_name, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (!agents || agents.length === 0) return { evaluated: 0, triggered: 0, blocked: 0, decisions: 0 };

  const totalAgents = agents.length;
  const agentIds = agents.map((a: Record<string, unknown>) => a.id);

  // Global circuit breaker
  try {
    const { data: globalBreaker } = await supabase.rpc('check_global_circuit_breaker', {
      p_tenant_id: tenantId,
      p_max_impact_percent: 30,
      p_window_minutes: 10,
    });
    if (globalBreaker && !globalBreaker.allowed) {
      logger.warn(`[Enterprise Engine v2] GLOBAL CIRCUIT BREAKER OPEN for tenant ${tenantId}: ${globalBreaker.reason || 'Impact threshold exceeded'}`);
      return { evaluated: 0, triggered: 0, blocked: rules.length, decisions: 1 };
    }
  } catch (e) {
    logger.warn('[Enterprise Engine v2] Global circuit breaker check failed (fail-open):', e);
  }

  // Tenant daily quota
  try {
    const { data: quota } = await supabase.rpc('check_tenant_automation_quota', { p_tenant_id: tenantId });
    if (quota && !quota.allowed) {
      logger.warn(`[Enterprise Engine v2] TENANT QUOTA EXHAUSTED for ${tenantId}: ${quota.current}/${quota.max}`);
      return { evaluated: 0, triggered: 0, blocked: rules.length, decisions: 1 };
    }
  } catch (e) {
    logger.warn('[Enterprise Engine v2] Tenant quota check failed (fail-open):', e);
  }

  const { data: metrics } = await supabase
    .from('agent_system_metrics_partitioned')
    .select('*')
    .in('agent_id', agentIds)
    .order('collected_at', { ascending: false });

  const latestMetrics = new Map<string, any>();
  (metrics || []).forEach((m: Record<string, unknown>) => {
    if (!latestMetrics.has(m.agent_id as string)) latestMetrics.set(m.agent_id as string, m);
  });

  let totalTriggered = 0;
  let totalBlocked = 0;
  let totalDecisions = 0;
  const allExecutions: Array<Record<string, unknown>> = [];

  for (const rule of rules) {
    if (isInCooldown(rule)) {
      totalDecisions++;
      await logDecision(supabase, tenantId, rule, null, 'blocked_cooldown', 'Rule-level cooldown active', null, false);
      continue;
    }

    if (rule.mode === 'disabled') {
      totalDecisions++;
      await logDecision(supabase, tenantId, rule, null, 'blocked_disabled', 'Rule disabled', null, false);
      continue;
    }

    const lockAcquired = await tryAcquireRuleLock(supabase, rule.id);
    if (!lockAcquired) {
      totalDecisions++;
      await logDecision(supabase, tenantId, rule, null, 'blocked_lock', 'Rule locked by another instance', null, false);
      continue;
    }

    let candidates: TriggerCandidate[] = [];

    if (rule.trigger_type === 'metric_threshold') {
      candidates = await evaluateMetricThreshold(supabase, rule, tenantId, agents, latestMetrics);
    } else if (rule.trigger_type === 'process_anomaly' || rule.trigger_type === 'anomaly_detection') {
      candidates = await evaluateProcessAnomaly(supabase, rule, tenantId, agents);
    } else if (rule.trigger_type === 'agent_status') {
      candidates = await evaluateAgentStatus(supabase, rule, tenantId, agents);
    } else if (rule.trigger_type === 'security_check') {
      candidates = await evaluateSecurityCheck(supabase, rule, tenantId, agents);
    }

    for (const candidate of candidates) {
      totalDecisions++;

      const protection = await runProtectionPipeline(supabase, rule, candidate.agentId, tenantId, totalAgents, candidate.triggerData?.severity);

      if (!protection.allowed) {
        totalBlocked++;
        await logDecision(supabase, tenantId, rule, candidate.agentId, protection.decision, protection.reason, candidate.triggerData, false);
        if (protection.decision === 'blocked_approval_required') {
          await createApprovalRequest(supabase, tenantId, rule, candidate.agentId, candidate.triggerData);
        }
        continue;
      }

      const startTime = Date.now();
      const { status, result } = await executeAction(supabase, rule, candidate.agentId, tenantId, candidate.triggerData, agents);
      const execTimeMs = Date.now() - startTime;
      const success = status === 'executed';

      if (success) {
        try { await supabase.rpc('increment_tenant_quota', { p_tenant_id: tenantId }); } catch { /* non-critical */ }
      }

      await logExecution(supabase, tenantId, candidate.agentId, rule.id, rule.action_type, success, protection.idempotencyKey, { ...result, execution_time_ms: execTimeMs });
      await logDecision(supabase, tenantId, rule, candidate.agentId, 'executed', `Action ${rule.action_type} ${status}`, candidate.triggerData, true);

      allExecutions.push({
        tenant_id: tenantId, rule_id: rule.id, agent_id: candidate.agentId,
        trigger_data: candidate.triggerData, action_taken: rule.action_type,
        action_result: result, status,
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });

      totalTriggered++;
    }
  }

  if (allExecutions.length > 0) {
    await supabase.from('automation_executions').insert(allExecutions);
    const triggeredRuleIds = [...new Set(allExecutions.map((e) => e.rule_id))];
    for (const ruleId of triggeredRuleIds) {
      const rule = rules.find((r: Record<string, unknown>) => r.id === ruleId);
      await supabase.from('automation_rules').update({
        last_triggered_at: new Date().toISOString(),
        trigger_count: (rule?.trigger_count || 0) + 1,
      }).eq('id', ruleId);
    }
  }

  let riskScore: number | undefined;
  try {
    const { data: score } = await supabase.rpc('recalculate_tenant_risk_score', { p_tenant_id: tenantId });
    riskScore = score;
  } catch { /* Non-critical */ }

  return { evaluated: rules.length, triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions, risk_score: riskScore };
}
