/**
 * evaluate-playbook-triggers — Migrated to serveInternal middleware
 * Evaluates trigger events against active playbooks and creates executions.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

import type { TriggerEvent, PlaybookAction, RiskAnalysis, TenantSettings } from './types.ts';
import { evaluateConditions } from './condition-engine.ts';
import { handleSemiAutomaticApproval } from './approval-handler.ts';

serveInternal(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const startTime = Date.now();
  const origin = req.headers.get('origin');

  const { tenant_id, trigger_type, agent_id, context = {} } = body as TriggerEvent;

  if (!tenant_id || !trigger_type) {
    return new Response(JSON.stringify({ error: 'tenant_id and trigger_type are required' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  logger.info(`[evaluate-playbook-triggers] Evaluating ${trigger_type} for tenant ${tenant_id}`);

  // Shadow mode check
  const { data: tenantSettings } = await supabase.from('tenant_settings').select('enable_dry_run_mode').eq('tenant_id', tenant_id).single();
  const isDryRun = (tenantSettings as TenantSettings)?.enable_dry_run_mode ?? false;
  if (isDryRun) logger.info(`[evaluate-playbook-triggers] Shadow Mode ACTIVE for tenant ${tenant_id}`);

  // Fetch matching playbooks
  const { data: playbooks, error: pbError } = await supabase.from('playbooks').select(`*, actions:playbook_actions(*)`).eq('trigger_type', trigger_type).eq('is_enabled', true).or(`tenant_id.eq.${tenant_id},is_system.eq.true`).order('is_system', { ascending: true });
  if (pbError) throw pbError;
  if (!playbooks || playbooks.length === 0) return { triggered: false, reason: 'No active playbooks for this trigger type' };

  const playbook = playbooks[0];
  const cooldownMinutes = playbook.cooldown_minutes || 60;

  // Anti-loop cooldown
  const { data: hasRecentExec } = await supabase.rpc('has_recent_playbook_execution', { p_playbook_id: playbook.id, p_tenant_id: tenant_id, p_agent_id: agent_id || null, p_cooldown_minutes: cooldownMinutes });
  if (hasRecentExec) return { triggered: false, reason: 'Cooldown active', cooldown_minutes: cooldownMinutes };

  // Evaluate conditions
  if (!evaluateConditions(trigger_type, playbook.trigger_conditions || {}, context)) {
    return { triggered: false, reason: 'Trigger conditions not met', conditions: playbook.trigger_conditions, context };
  }

  // Risk analysis
  const { data: riskData, error: riskError } = await supabase.rpc('should_auto_execute_playbook', { p_playbook_id: playbook.id, p_event_type: trigger_type, p_context: context });
  const riskAnalysis: RiskAnalysis = riskError ? { risk_score: 0.5, threshold: 0.8, should_auto_execute: false, has_destructive_actions: false, require_approval: playbook.require_approval, is_enabled: playbook.is_enabled, decision_reason: 'risk_calculation_failed' } : riskData as RiskAnalysis;

  // Agent info
  let agentInfo = null;
  if (agent_id) {
    const { data: agent } = await supabase.from('agents').select('agent_name, hostname, os_type, status, last_heartbeat').eq('id', agent_id).single();
    agentInfo = agent;
  }

  // Snapshots
  const playbookSnapshot = { id: playbook.id, name: playbook.name, description: playbook.description, severity: playbook.severity, trigger_type: playbook.trigger_type, trigger_conditions: playbook.trigger_conditions, version: playbook.version, require_approval: playbook.require_approval, cooldown_minutes: cooldownMinutes, execution_mode: playbook.execution_mode || 'assistive', snapshot_created_at: new Date().toISOString() };
  const actionsSnapshot = (playbook.actions as PlaybookAction[] || []).sort((a, b) => a.order_index - b.order_index).map(a => ({ id: a.id, order_index: a.order_index, action_type: a.action_type, label: a.label, description: a.description, action_payload: a.action_payload, risk_level: a.risk_level }));

  // Human review check
  const { data: needsHumanReview } = await supabase.rpc('requires_human_review', { p_tenant_id: tenant_id, p_severity: playbook.severity || 'medium', p_action_type: trigger_type });
  const wouldAutoExecute = riskAnalysis.should_auto_execute;
  const shouldAutoExecute = isDryRun ? false : (needsHumanReview ? false : wouldAutoExecute);
  const decision = isDryRun ? 'dry_run' : (shouldAutoExecute ? 'auto_execute' : 'require_approval');
  const triggeredBy = shouldAutoExecute ? 'risk_engine' : (isDryRun ? 'dry_run' : 'trigger');

  // Create execution
  const { data: execution, error: execError } = await supabase.from('playbook_executions').insert({
    playbook_id: playbook.id, tenant_id, agent_id: agent_id || null, trigger_source: trigger_type,
    trigger_context: { ...context, agent_info: agentInfo, evaluated_at: new Date().toISOString(), risk_analysis: riskAnalysis, dry_run: isDryRun },
    playbook_snapshot: playbookSnapshot, actions_snapshot: actionsSnapshot,
    status: shouldAutoExecute ? 'in_progress' : 'pending',
    auto_executed: shouldAutoExecute, risk_score: riskAnalysis.risk_score, triggered_by: triggeredBy, dry_run: isDryRun,
  }).select('id').single();
  if (execError) throw execError;

  // Risk decision log
  await supabase.from('risk_decision_log').insert({
    playbook_execution_id: execution.id, tenant_id, event_type: trigger_type,
    playbook_id: playbook.id, playbook_name: playbook.name, agent_id: agent_id || null,
    risk_score: riskAnalysis.risk_score, threshold: riskAnalysis.threshold, decision,
    decision_reason: isDryRun ? `Shadow Mode ativo - seria ${wouldAutoExecute ? 'auto_execute' : 'require_approval'} (${riskAnalysis.decision_reason})` : riskAnalysis.decision_reason,
    context: { ...context, agent_info: agentInfo, has_destructive_actions: riskAnalysis.has_destructive_actions, playbook_require_approval: playbook.require_approval },
    dry_run: isDryRun,
  });

  // Handle execution mode
  const executionMode = playbook.execution_mode || 'assistive';
  if (executionMode === 'semi_automatic') {
    const approvalError = await handleSemiAutomaticApproval(supabase, tenant_id, execution.id, playbook, actionsSnapshot, trigger_type, agent_id || null, agentInfo, origin);
    if (approvalError) return approvalError;
  } else if (shouldAutoExecute) {
    try {
      await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/functions/v1/execute-playbook-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ execution_id: execution.id }),
      });
    } catch (autoExecError) { logger.error('[evaluate-playbook-triggers] Auto-execute error:', autoExecError); }
  }

  // Security log
  await supabase.from('security_logs').insert({ tenant_id, ip_address: 'system', endpoint: 'playbook/trigger', attack_type: 'playbook_triggered', severity: playbook.severity === 'critical' ? 'critical' : 'medium', blocked: false, details: { playbook_id: playbook.id, playbook_name: playbook.name, playbook_version: playbook.version, execution_id: execution.id, trigger_type, agent_id, risk_analysis: { risk_score: riskAnalysis.risk_score, threshold: riskAnalysis.threshold, decision_reason: riskAnalysis.decision_reason, has_destructive_actions: riskAnalysis.has_destructive_actions }, auto_executed: shouldAutoExecute, triggered_by: triggeredBy, dry_run: isDryRun, would_auto_execute: wouldAutoExecute } });

  return {
    triggered: true, execution_id: execution.id,
    playbook: { id: playbook.id, name: playbook.name, version: playbook.version, severity: playbook.severity, require_approval: playbook.require_approval, actions_count: actionsSnapshot.length },
    agent_info: agentInfo, snapshots_created: true, risk_analysis: riskAnalysis,
    auto_executed: shouldAutoExecute, triggered_by: triggeredBy, dry_run: isDryRun, would_auto_execute: wouldAutoExecute,
    execution_time_ms: Date.now() - startTime,
  };
});
