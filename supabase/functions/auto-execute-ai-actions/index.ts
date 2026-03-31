/**
 * auto-execute-ai-actions - Auto-executes low-risk AI actions
 * MODULARIZED: policy-resolver.ts and action-executor.ts
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { resolvePolicy, shouldSkipAction } from './policy-resolver.ts';
import { executeAction, recordExecution, recordFailure } from './action-executor.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();
  logger.info(`[${requestId}] auto-execute-ai-actions started`);

  // Kill switch
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    return new Response(JSON.stringify({ success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Fetch pending actions (balanced across tenants)
  const { data: pendingActionsRaw, error: actionsError } = await supabase.rpc('get_balanced_pending_actions', { p_limit: 50 });
  let pendingActions = pendingActionsRaw;
  if (actionsError || !pendingActionsRaw) {
    const { data, error } = await supabase.from('ai_actions').select('id, tenant_id, action_type, action_payload, insight_id, ai_insights(id, confidence_score, insight_type, status)').eq('status', 'pending').order('created_at', { ascending: true }).limit(50);
    if (error) throw error;
    pendingActions = data;
  }

  if (!pendingActions || pendingActions.length === 0) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'auto-execute-ai-actions', p_success: true, p_duration_ms: Date.now() - startTime, p_result: { message: 'No pending actions' }, p_processed_count: 0, p_job_source: 'cron' });
    return { success: true, message: 'No pending actions', actions_processed: 0 };
  }

  const { data: actionConfigs } = await supabase.from('ai_action_configs').select('action_type, is_enabled, requires_approval, risk_level, max_executions_per_day');
  const configMap = new Map(actionConfigs?.map(c => [c.action_type, c]) || []);

  const result = { actions_processed: 0, actions_executed: 0, actions_skipped: 0, insights_resolved: 0, errors: [] as string[] };

  for (const action of pendingActions) {
    result.actions_processed++;
    const config = configMap.get(action.action_type);
    const insight = action.ai_insights as Record<string, unknown>;

    const insightType = (insight?.insight_type as string) || '';
    const policy = await resolvePolicy(supabaseUrl, supabaseKey, action.tenant_id, insightType, requestId);

    const skipReason = shouldSkipAction(config, policy, requestId, action.id);
    if (skipReason) { logger.info(`[${requestId}] Skipping ${action.id}: ${skipReason}`); result.actions_skipped++; continue; }

    const insightSeverity = (insight?.severity as string) || config?.risk_level || 'medium';
    const { data: needsHumanReview } = await supabase.rpc('requires_human_review', { p_tenant_id: action.tenant_id, p_severity: insightSeverity, p_action_type: action.action_type });
    if (needsHumanReview) {
      await supabase.from('approval_requests').insert({ tenant_id: action.tenant_id, action_type: action.action_type, action_payload: { ...(action.action_payload as Record<string, unknown>), insight_id: action.insight_id, original_severity: insightSeverity, human_review_reason: 'critical_severity_requires_approval' }, requested_by: null, status: 'pending', required_approvers: 1, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      await supabase.from('ai_actions').update({ status: 'awaiting_approval' }).eq('id', action.id);
      result.actions_skipped++; continue;
    }

    const { data: canExecute } = await supabase.rpc('check_action_rate_limit', { p_action_type: action.action_type, p_tenant_id: action.tenant_id });
    if (!canExecute) { result.actions_skipped++; continue; }

    if (action.insight_id && insight) {
      await supabase.from('ai_insights').update({ status: 'in_progress' }).eq('id', action.insight_id);
    }

    try {
      const executionResult = await executeAction(supabase, action, requestId);
      if (executionResult === null) { result.actions_skipped++; continue; }

      await recordExecution(supabase, action.id, action.tenant_id, action.insight_id, executionResult, policy.source, policy.execution_mode);
      if (action.insight_id) result.insights_resolved++;
      result.actions_executed++;
      logger.info(`[${requestId}] Auto-executed action ${action.id} (policy_source=${policy.source})`);
    } catch (execError: unknown) {
      const errMsg = execError instanceof Error ? execError.message : String(execError);
      logger.error(`[${requestId}] Failed to execute action ${action.id}:`, execError);
      result.errors.push(`${action.id}: ${errMsg}`);
      await recordFailure(supabase, action.id, action.insight_id, execError.message);
    }
  }

  const duration = Date.now() - startTime;
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'auto-execute-ai-actions', p_success: true, p_duration_ms: duration, p_result: result, p_processed_count: result.actions_processed, p_job_source: 'cron' });

  return { success: true, request_id: requestId, duration_ms: duration, ...result };
});
