import type { PlaybookAction, ActionContext } from '../types.ts';

export async function handleRevokeToken(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const { supabase, agentId, tenantId, executionId, playbookSnapshot } = ctx;
  if (!agentId) throw new Error('Agent ID required for token revocation');

  const { count } = await supabase
    .from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', agentId)
    .eq('is_active', true);

  await supabase.from('security_logs').insert({
    tenant_id: tenantId,
    ip_address: 'system',
    endpoint: 'playbook/revoke_token',
    attack_type: 'token_revocation',
    severity: 'high',
    blocked: false,
    details: {
      agent_id: agentId,
      tokens_revoked: count || 0,
      triggered_by: 'playbook',
      execution_id: executionId,
      playbook_version: playbookSnapshot.version,
    },
  });

  return { tokens_revoked: count || 0 };
}

export async function handleEscalate(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const { supabase, tenantId, agentId, executionId, playbookSnapshot, triggerContext } = ctx;
  const payload = action.action_payload;

  const { data: alert } = await supabase
    .from('system_alerts')
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      alert_type: 'playbook_escalation',
      severity: 'high',
      message: `Escalacao de playbook: ${action.label}`,
      details: {
        playbook_execution_id: executionId,
        playbook_version: playbookSnapshot.version,
        action_description: action.description,
        notify_roles: payload.notify_roles,
        create_incident: payload.create_incident,
        context: triggerContext,
      },
    })
    .select('id')
    .single();

  if (payload.create_incident) {
    await supabase.from('security_events').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      severity: 'high',
      title: `Incidente: ${action.label}`,
      description: action.description,
      status: 'open',
      data: {
        playbook_execution_id: executionId,
        playbook_version: playbookSnapshot.version,
        alert_id: alert?.id,
        context: triggerContext,
      },
    });
  }

  return { alert_id: alert?.id, incident_created: !!payload.create_incident };
}

export async function handleGenerateReport(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const { supabase, tenantId, agentId, executionId, playbookSnapshot, triggerContext } = ctx;
  const payload = action.action_payload;

  const { data: evidence } = await supabase
    .from('agent_evidence_logs')
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      agent_name: (triggerContext.agent_info as Record<string, unknown>)?.agent_name || 'system',
      event_type: 'playbook_report_generated',
      event_data: {
        report_type: payload.report_type,
        action_label: action.label,
        execution_id: executionId,
        playbook_version: playbookSnapshot.version,
        include_history: payload.include_history,
        include_domains: payload.include_domains,
        days_back: payload.days_back || 30,
      },
      evidence_hash: crypto.randomUUID(),
      severity: 'info',
    })
    .select('id')
    .single();

  return {
    report_type: payload.report_type,
    evidence_id: evidence?.id,
    scheduled: true,
  };
}
