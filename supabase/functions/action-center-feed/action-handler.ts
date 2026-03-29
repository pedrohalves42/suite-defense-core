import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
/**
 * Action handler — processes POST actions from the action center
 */
import { logger } from '../_shared/logger.ts';

export async function handleAction(
  serviceClient: SupabaseClient,
  userClient: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const { item_id, source_type, action, reason, reason_category } = body as Record<string, string>;

  if (!item_id || !action) {
    return jsonResponse({ error: 'Missing item_id or action' }, 400);
  }

  logger.debug('[action-center-feed] Executing action:', { item_id, source_type, action });

  // --- Playbook actions ---
  if (source_type === 'playbook' && action === 'execute') {
    const { data, error } = await userClient.functions.invoke('execute-playbook-action', {
      body: { execution_id: item_id },
    });
    if (error) {
      logger.error('[action-center-feed] Execute playbook error:', error);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ success: true, data });
  }

  if (source_type === 'playbook' && action === 'ignore') {
    const { error } = await serviceClient
      .from('playbook_executions')
      .update({ status: 'ignored', ignore_reason: reason || 'Ignorado via Action Center', completed_at: new Date().toISOString() })
      .eq('id', item_id)
      .eq('tenant_id', tenantId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  // --- Alert actions ---
  if (source_type === 'alert' && action === 'acknowledge') {
    const { error } = await serviceClient
      .from('system_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq('id', item_id)
      .eq('tenant_id', tenantId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  if (source_type === 'alert' && action === 'execute') {
    return await handleAlertExecute(serviceClient, userClient, userId, tenantId, item_id);
  }

  if (source_type === 'alert' && action === 'ignore') {
    const { error } = await serviceClient
      .from('system_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq('id', item_id)
      .eq('tenant_id', tenantId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  // --- Agent offline actions ---
  if (source_type === 'agent_offline' && action === 'acknowledge') {
    return jsonResponse({ success: true, message: 'Offline status acknowledged' });
  }

  if (source_type === 'agent_offline' && action === 'execute') {
    const agentId = item_id.replace('offline_', '');
    const { data: agent } = await serviceClient
      .from('agents')
      .select('id, agent_name, tenant_id')
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .single();

    if (agent) {
      const { data: job, error: jobErr } = await serviceClient
        .from('jobs')
        .insert({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          tenant_id: tenantId,
          type: 'service_health_check',
          status: 'pending',
          payload: { action: 'restart_service', service_name: 'CyberShieldAgent', reason: 'agent_offline_recovery', triggered_by: userId },
          priority: 1,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (jobErr) logger.warn('[action-center-feed] Failed to create recovery job:', jobErr);
      return jsonResponse({ success: true, message: 'Recovery job created for offline agent', job_id: job?.id || null });
    }
    return jsonResponse({ success: true, message: 'Agent not found for recovery' });
  }

  if (source_type === 'agent_offline' && action === 'ignore') {
    return jsonResponse({ success: true, message: 'Offline status ignored' });
  }

  // --- AI Insight actions ---
  if (source_type === 'ai_insight' && action === 'acknowledge') {
    const { error } = await serviceClient
      .from('ai_insights')
      .update({ acknowledged: true, acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
      .eq('id', item_id)
      .eq('tenant_id', tenantId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  if (source_type === 'ai_insight' && action === 'ignore') {
    const { error } = await serviceClient
      .from('ai_insights')
      .update({ status: 'ignored', resolved_at: new Date().toISOString(), resolved_by: userId, acknowledged: true, acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
      .eq('id', item_id)
      .eq('tenant_id', tenantId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true, status: 'ignored' });
  }

  if (source_type === 'ai_insight' && action === 'reject') {
    if (!reason) return jsonResponse({ error: 'Rejection reason is required' }, 400);

    const now = new Date().toISOString();
    const { data: insight, error: insightError } = await serviceClient
      .from('ai_insights')
      .select('id, title, insight_type, severity, agent_id')
      .eq('id', item_id)
      .eq('tenant_id', tenantId)
      .single();

    if (insightError) return jsonResponse({ error: 'Insight not found' }, 404);

    const { error: updateError } = await serviceClient
      .from('ai_insights')
      .update({ rejected_at: now, rejected_by: userId, rejection_reason: reason, acknowledged: true, acknowledged_at: now, acknowledged_by: userId, status: 'rejected' })
      .eq('id', item_id)
      .eq('tenant_id', tenantId);

    if (updateError) return jsonResponse({ error: updateError.message }, 500);

    await serviceClient.from('decision_events').insert({
      tenant_id: tenantId,
      rule_code: 'AI_INSIGHT_REJECTION',
      action: 'reject_ai_insight',
      evidence: { insight_id: item_id, insight_type: insight?.insight_type, insight_title: insight?.title, severity: insight?.severity, rejection_reason: reason, rejection_category: reason_category || 'unspecified', rejected_at: now, rejected_by: userId, user_email: userEmail, agent_id: insight?.agent_id },
      decision_source: 'human',
      decision_type: 'rejection',
    }).catch((e: Error) => logger.warn('[action-center-feed] Failed to create rejection event:', e));

    return jsonResponse({ success: true, status: 'rejected' });
  }

  if (source_type === 'ai_insight' && action === 'execute') {
    return await handleInsightExecute(serviceClient, userClient, userId, tenantId, item_id);
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}

async function handleAlertExecute(serviceClient: SupabaseClient, userClient: SupabaseClient, userId: string, tenantId: string, itemId: string): Promise<Response> {
  const { data: alert, error: alertFetchErr } = await serviceClient
    .from('system_alerts')
    .select('id, alert_type, severity, agent_id, details, title')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single();

  if (alertFetchErr || !alert) return jsonResponse({ error: 'Alert not found' }, 404);

  let remediationResult = null;
  const alertRemediationMap: Record<string, { action_type: string; trigger_source: string }> = {
    'antivirus_inactive': { action_type: 'enable_antivirus', trigger_source: 'alert_execute' },
    'firewall_disabled': { action_type: 'enable_firewall', trigger_source: 'alert_execute' },
    'unauthorized_usb': { action_type: 'block_usb_device', trigger_source: 'alert_execute' },
    'vulnerable_software': { action_type: 'suggest_patch', trigger_source: 'alert_execute' },
    'suspicious_process': { action_type: 'kill_process', trigger_source: 'alert_execute' },
    'malware_detected': { action_type: 'quarantine_file', trigger_source: 'alert_execute' },
    'auto_remediation': { action_type: 'restart_service', trigger_source: 'alert_execute' },
  };

  const remediation = alertRemediationMap[alert.alert_type];
  if (remediation && alert.agent_id) {
    try {
      const { data } = await userClient.functions.invoke('auto-remediate', {
        body: { agent_id: alert.agent_id, action_type: remediation.action_type, trigger_source: remediation.trigger_source, trigger_details: { alert_id: alert.id, alert_type: alert.alert_type, severity: alert.severity, ...(alert.details || {}) }, requires_approval: false },
      });
      remediationResult = data;
    } catch (e) {
      logger.warn('[action-center-feed] Remediation exception (non-blocking):', e);
    }
  }

  await serviceClient
    .from('system_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);

  return jsonResponse({ success: true, remediation_dispatched: !!remediation && !!alert.agent_id, remediation: remediationResult });
}

async function handleInsightExecute(serviceClient: SupabaseClient, userClient: SupabaseClient, userId: string, tenantId: string, itemId: string): Promise<Response> {
  const { data: insight, error: insightError } = await serviceClient
    .from('ai_insights')
    .select('id, tenant_id, agent_id, recommended_actions, insight_type, severity')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single();

  if (insightError || !insight) return jsonResponse({ error: 'Insight not found' }, 404);

  const recommendedActions = insight.recommended_actions as Array<{ action_type: string; parameters?: Record<string, unknown> }> | null;

  if (!recommendedActions || recommendedActions.length === 0) {
    await serviceClient.from('ai_insights').update({
      acknowledged: true, acknowledged_by: userId, acknowledged_at: new Date().toISOString(),
      status: 'reviewed_no_action', resolution_method: 'no_action_available',
      resolved_at: new Date().toISOString(), resolved_by: userId,
      final_outcome: 'Insight revisado - nenhuma acao automatizada disponivel.',
    }).eq('id', itemId);

    return jsonResponse({ success: true, message: 'Insight acknowledged - no automated actions available', status: 'reviewed_no_action' });
  }

  const firstAction = recommendedActions[0];
  const { data: createdAction, error: createError } = await serviceClient
    .from('ai_actions')
    .insert({ tenant_id: tenantId, insight_id: insight.id, agent_id: insight.agent_id, action_type: firstAction.action_type, parameters: firstAction.parameters || {}, status: 'pending', triggered_by: 'user_manual', created_by: userId })
    .select()
    .single();

  if (createError) return jsonResponse({ error: createError.message }, 500);

  try {
    const { data: execResult, error: execError } = await userClient.functions.invoke('ai-action-executor', {
      body: { action_id: createdAction.id },
    });

    if (execError) {
      return jsonResponse({ success: true, action_id: createdAction.id, warning: 'Action created but execution may have failed', error: execError.message });
    }

    await serviceClient.from('ai_insights').update({
      auto_action_executed: true, auto_action_executed_at: new Date().toISOString(),
      status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: userId,
    }).eq('id', itemId);

    return jsonResponse({ success: true, action_id: createdAction.id, result: execResult, status: 'resolved' });
  } catch (execErr) {
    logger.error('[action-center-feed] Execute action exception:', execErr);
    return jsonResponse({ success: true, action_id: createdAction.id, warning: 'Action created but execution threw exception' });
  }
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
