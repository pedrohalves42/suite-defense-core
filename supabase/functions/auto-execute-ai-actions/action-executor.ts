/**
 * Action execution logic for auto-execute-ai-actions
 * Extraído de auto-execute-ai-actions/index.ts
 */
import { logger } from '../_shared/logger.ts';

/**
 * Execute a single action by type and return the result.
 */
export async function executeAction(
  supabase: any,
  action: Record<string, any>,
  requestId: string,
): Promise<Record<string, unknown> | null> {
  switch (action.action_type) {
    case 'create_system_alert': {
      const payload = action.action_payload as Record<string, unknown>;
      const validAlertTypes = [
        'agent_offline', 'high_cpu', 'high_memory', 'high_disk',
        'job_failed', 'security_threat', 'memory_warning',
        'ai_insight_alert', 'blocked_access_pattern', 'job_integrity_violation',
        'safe_mode_auto', 'agent_divergent', 'progressive_degradation',
      ];
      let alertType = payload.alert_type || 'ai_insight_alert';
      if (!validAlertTypes.includes(alertType as string)) alertType = 'ai_insight_alert';

      const { data: alert, error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: action.tenant_id,
          alert_type: alertType,
          severity: payload.severity || 'info',
          title: ((payload.title || payload.message || 'AI Alert') as string).slice(0, 80),
          message: payload.message || payload.title || 'AI-generated alert',
          details: { insight_id: action.insight_id, auto_executed: true, source: 'auto-execute-ai-actions', original_payload: payload },
        })
        .select()
        .maybeSingle();

      if (alertError) throw alertError;
      return { alert_id: alert?.id || 'created' };
    }

    case 'cleanup_stuck_jobs': {
      const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_stuck_jobs');
      if (cleanupError) throw cleanupError;
      return { action_executed: true, cleanup_result: cleanupResult, jobs_cleaned: cleanupResult?.[0]?.cleaned_count || 0 };
    }

    case 'suggest_agent_restart':
    case 'suggest_config_change':
    case 'suggest_job_cleanup':
      return { suggestion_recorded: true, action_type: action.action_type, payload: action.action_payload };

    default:
      logger.info(`[${requestId}] Action type ${action.action_type} not auto-executable`);
      return null; // signals skip
  }
}

/**
 * Records a successful execution in ai_actions and ai_action_executions.
 */
export async function recordExecution(
  supabase: any,
  actionId: string,
  tenantId: string,
  insightId: string | null,
  executionResult: Record<string, unknown>,
  policySource: string,
  policyMode: string,
): Promise<void> {
  await supabase
    .from('ai_actions')
    .update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      result: { ...executionResult, policy_source: policySource, policy_mode: policyMode },
    })
    .eq('id', actionId);

  await supabase.from('ai_action_executions').insert({
    action_id: actionId,
    tenant_id: tenantId,
    execution_status: 'executed',
    execution_result: { ...executionResult, policy_source: policySource },
    executed_at: new Date().toISOString(),
  });

  if (insightId) {
    await supabase
      .from('ai_insights')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), auto_action_executed: true })
      .eq('id', insightId);
  }
}

/**
 * Records a failed execution.
 */
export async function recordFailure(
  supabase: any,
  actionId: string,
  insightId: string | null,
  errorMessage: string,
): Promise<void> {
  await supabase.from('ai_actions').update({ status: 'failed', error_message: errorMessage }).eq('id', actionId);
  if (insightId) {
    await supabase.from('ai_insights').update({ status: 'failed' }).eq('id', insightId);
  }
}
