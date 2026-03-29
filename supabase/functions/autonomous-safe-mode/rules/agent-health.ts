/**
 * Agent health rules: SAFE_MODE_RULE_001, AGENT_THROTTLE_002,
 * AGENT_IMPRODUTIVE_005, AUTO_REVERT_THROTTLE_006
 */
import { logger } from '../../_shared/logger.ts';
import type { RuleResult, ActionExecuted, RuleRecord } from '../types.ts';

export async function processSafeModeRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    time_window_minutes: 10,
    min_failures: 3,
    heartbeat_max_age_seconds: 300
  };

  const timeWindowMinutes = (conditions.time_window_minutes as number) || 10;
  const minFailures = (conditions.min_failures as number) || 3;

  logger.debug(`[SAFE_MODE_RULE_001] Detecting failure patterns (window: ${timeWindowMinutes}min, threshold: ${minFailures})`);

  const { data: agentsWithFailures, error: detectError } = await supabase
    .rpc('detect_critical_failure_pattern', {
      p_window_minutes: timeWindowMinutes,
      p_min_failures: minFailures
    });

  if (detectError) {
    logger.error('[SAFE_MODE_RULE_001] Error detecting failure patterns:', detectError);
    throw detectError;
  }

  logger.debug(`[SAFE_MODE_RULE_001] Found ${agentsWithFailures?.length || 0} candidates`);

  const agents: RuleResult['agents'] = [];

  for (const agent of agentsWithFailures || []) {
    if (!agent.heartbeat_active) continue;

    const actionsExecuted: ActionExecuted[] = [];

    const { data: entryResult, error: entryError } = await supabase
      .rpc('enter_autonomous_safe_mode', {
        p_agent_id: agent.agent_id,
        p_reason: `Deteccao automatica: ${agent.failure_count} falhas do tipo "${agent.failure_type}" em ${timeWindowMinutes} minutos`,
        p_failure_type: agent.failure_type,
        p_failure_count: agent.failure_count
      });

    if (entryError) {
      logger.error(`[SAFE_MODE_RULE_001] Error for ${agent.agent_name}:`, entryError);
      continue;
    }

    actionsExecuted.push({ type: 'ENTER_SAFE_MODE', success: true, id: entryResult?.safe_mode_event_id });
    actionsExecuted.push({ type: 'CREATE_AI_INSIGHT', success: true, id: entryResult?.insight_id });
    actionsExecuted.push({ type: 'CREATE_SYSTEM_ALERT', success: true, id: entryResult?.alert_id });

    const { data: snapshotJob, error: snapshotError } = await supabase
      .from('jobs')
      .insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        type: 'forensic_snapshot',
        status: 'queued',
        approved: true,
        payload: {
          triggered_by: 'autonomous_safe_mode',
          rule_code: rule.code,
          failure_pattern: { error_signature: agent.failure_type, failure_count: agent.failure_count }
        }
      })
      .select('id')
      .single();

    actionsExecuted.push({
      type: 'FORENSIC_SNAPSHOT',
      success: !snapshotError,
      id: snapshotJob?.id,
      error: snapshotError?.message
    });

    try {
      await supabase.functions.invoke('notification-router', {
        body: {
          action: 'dispatch',
          payload: {
            tenant_id: agent.tenant_id,
            notification_type: 'safe_mode_auto',
            title: `SAFE_MODE Automatico: ${agent.agent_name}`,
            message: `O agente ${agent.agent_name} entrou automaticamente em SAFE_MODE apos ${agent.failure_count} falhas.`,
            severity: 'critical',
            data: { agent_id: agent.agent_id, agent_name: agent.agent_name, rule_code: rule.code }
          }
        }
      });
      actionsExecuted.push({ type: 'SEND_NOTIFICATION', success: true });
    } catch (e) {
      actionsExecuted.push({ type: 'SEND_NOTIFICATION', success: false, error: String(e) });
    }

    await supabase.from('decision_events').insert({
      tenant_id: agent.tenant_id,
      rule_code: rule.code,
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      action: 'ENTER_SAFE_MODE',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        error_signature: agent.failure_type,
        failure_count: agent.failure_count,
        time_window_minutes: timeWindowMinutes,
        agent_version: agent.agent_version,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      action: 'ENTER_SAFE_MODE',
      reason: `${agent.failure_count} falhas do tipo "${agent.failure_type}"`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processThrottleRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    requests_per_minute: 60,
    error_rate_percent: 50,
    time_window_minutes: 5
  };
  const params = rule.definition?.parameters || { poll_interval_seconds: 300 };

  logger.debug(`[AGENT_THROTTLE_002] Detecting throttle candidates`);

  const { data: candidates, error } = await supabase
    .rpc('detect_throttle_candidates', {
      p_requests_per_minute: conditions.requests_per_minute,
      p_time_window_minutes: conditions.time_window_minutes
    });

  if (error) {
    logger.error('[AGENT_THROTTLE_002] Detection error:', error);
    throw error;
  }

  logger.debug(`[AGENT_THROTTLE_002] Found ${candidates?.length || 0} candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    const { error: throttleError } = await supabase
      .rpc('apply_agent_throttle', {
        p_agent_id: candidate.agent_id,
        p_poll_interval_seconds: (params as Record<string, unknown>).poll_interval_seconds || 300,
        p_reason: `Alta taxa de requisicoes: ${candidate.request_count} requests, ${candidate.error_rate}% erros`
      });

    if (throttleError) {
      logger.error(`[AGENT_THROTTLE_002] Error throttling ${candidate.agent_name}:`, throttleError);
      continue;
    }

    actionsExecuted.push({ type: 'APPLY_THROTTLE', success: true });

    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        request_count: candidate.request_count,
        error_count: candidate.error_count,
        error_rate: candidate.error_rate,
        new_poll_interval: (params as Record<string, unknown>).poll_interval_seconds,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      reason: `${candidate.request_count} requests, ${candidate.error_rate}% taxa de erro`
    });

    logger.debug(`[AGENT_THROTTLE_002] Throttled agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processImprodutiveRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const params = rule.definition?.parameters || {
    poll_interval_seconds: 300,
    auto_revert_after_hours: 2
  };

  logger.debug(`[AGENT_IMPRODUTIVE_005] Detecting improdutive agents`);

  const { data: candidates, error } = await supabase
    .rpc('detect_improdutive_agents');

  if (error) {
    logger.error('[AGENT_IMPRODUTIVE_005] Detection error:', error);
    throw error;
  }

  logger.debug(`[AGENT_IMPRODUTIVE_005] Found ${candidates?.length || 0} improdutive agents`);

  const agents: RuleResult['agents'] = [];
  const pollInterval = (params as Record<string, unknown>).poll_interval_seconds as number || 300;
  const revertHours = (params as Record<string, unknown>).auto_revert_after_hours as number || 2;

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    const { error: throttleError } = await supabase
      .rpc('apply_agent_throttle', {
        p_agent_id: candidate.agent_id,
        p_poll_interval_seconds: pollInterval,
        p_reason: `Improdutivo: ${candidate.stale_queued_jobs || 0} jobs parados, ${Math.round(candidate.minutes_since_execution || 0)}min sem execucao`
      });

    if (throttleError) {
      logger.error(`[AGENT_IMPRODUTIVE_005] Error throttling ${candidate.agent_name}:`, throttleError);
      actionsExecuted.push({ type: 'APPLY_THROTTLE', success: false, error: throttleError.message });
      continue;
    }

    actionsExecuted.push({ type: 'APPLY_THROTTLE', success: true });

    const { error: insightError } = await supabase.from('ai_insights').insert({
      tenant_id: candidate.tenant_id,
      title: `Agente improdutivo: ${candidate.agent_name}`,
      description: `O agente esta online mas nao processa jobs ha ${Math.round(candidate.minutes_since_execution || 0)} minutos. Foi aplicado throttle automatico (poll interval: ${pollInterval}s) que sera revertido automaticamente em ${revertHours}h.`,
      severity: 'medium',
      insight_type: 'agent_improdutive',
      evidence: {
        health_status: candidate.health_status,
        stale_queued_jobs: candidate.stale_queued_jobs,
        pending_jobs: candidate.pending_jobs,
        minutes_since_execution: candidate.minutes_since_execution
      },
      recommendation: 'Verifique se o agente esta com problemas de conectividade ou se ha bloqueios no sistema.',
      acknowledged: false
    });

    actionsExecuted.push({
      type: 'CREATE_AI_INSIGHT',
      success: !insightError,
      error: insightError?.message
    });

    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        health_status: candidate.health_status,
        minutes_since_heartbeat: candidate.minutes_since_heartbeat,
        minutes_since_execution: candidate.minutes_since_execution,
        stale_queued_jobs: candidate.stale_queued_jobs,
        pending_jobs: candidate.pending_jobs,
        new_poll_interval: pollInterval,
        auto_revert_scheduled: true,
        auto_revert_after_hours: revertHours,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      reason: `Improdutivo: ${candidate.stale_queued_jobs || 0} jobs parados, ${Math.round(candidate.minutes_since_execution || 0)}min sem execucao`
    });

    logger.debug(`[AGENT_IMPRODUTIVE_005] Throttled improdutive agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processAutoRevertThrottle(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  logger.debug('[AUTO_REVERT_THROTTLE_006] Checking revert candidates');

  const { data: candidates, error } = await supabase
    .rpc('detect_throttle_revert_candidates');

  if (error) {
    logger.error('[AUTO_REVERT_THROTTLE_006] Detection error:', error);
    throw error;
  }

  logger.debug(`[AUTO_REVERT_THROTTLE_006] Found ${candidates?.length || 0} revert candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    const { error: revertError } = await supabase
      .rpc('remove_agent_throttle', { p_agent_id: candidate.agent_id });

    if (revertError) {
      logger.error(`[AUTO_REVERT_THROTTLE_006] Error reverting ${candidate.agent_name}:`, revertError);
      actionsExecuted.push({ type: 'REMOVE_THROTTLE', success: false, error: revertError.message });
      continue;
    }

    actionsExecuted.push({ type: 'REMOVE_THROTTLE', success: true });

    const { error: insightError } = await supabase.from('ai_insights').insert({
      tenant_id: candidate.tenant_id,
      title: `Throttle removido: ${candidate.agent_name}`,
      description: `O agente voltou a executar jobs normalmente (ultima execucao: ${Math.round(candidate.minutes_since_execution || 0)}min, pending: ${candidate.pending_jobs}) e teve o throttle removido automaticamente apos cooldown de 2h.`,
      severity: 'low',
      insight_type: 'agent_recovered',
      evidence: {
        throttled_at: candidate.throttled_at,
        minutes_since_execution: candidate.minutes_since_execution,
        pending_jobs: candidate.pending_jobs,
        reverted_at: new Date().toISOString()
      },
      recommendation: 'Nenhuma acao necessaria. O agente esta operando normalmente.',
      acknowledged: false
    });

    actionsExecuted.push({
      type: 'CREATE_AI_INSIGHT',
      success: !insightError,
      error: insightError?.message
    });

    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'REMOVE_THROTTLE',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        throttled_at: candidate.throttled_at,
        minutes_since_execution: candidate.minutes_since_execution,
        pending_jobs: candidate.pending_jobs,
        cooldown_hours: 2,
        reverted_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'REMOVE_THROTTLE',
      reason: 'Estabilizacao confirmada apos cooldown de 2h'
    });

    logger.debug(`[AUTO_REVERT_THROTTLE_006] Reverted throttle for ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}
