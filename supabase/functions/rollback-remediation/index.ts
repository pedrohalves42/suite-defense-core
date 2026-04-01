/**
 * rollback-remediation — Migrated to serveTenant
 * Rollback a remediation action by creating an inverse job.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RollbackRemSchema = z.object({
  action_id: z.string().uuid(),
});

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  const { data: userRoles } = await supabase
    .from('user_roles').select('tenant_id, role').eq('user_id', userId!);

  const adminRoles = (userRoles || []).filter(r => ['admin', 'super_admin'].includes(r.role));
  if (adminRoles.length === 0) {
    return new Response(JSON.stringify({ error: 'Admin role required for rollback' }), { status: 403 });
  }

  const parsed = RollbackRemSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { action_id } = parsed.data;

  const userTenantIds = adminRoles.map(r => r.tenant_id);

  const { data: action, error: fetchErr } = await supabase
    .from('auto_remediation_actions').select('*')
    .eq('id', action_id).in('tenant_id', userTenantIds).single();

  if (fetchErr || !action) return new Response(JSON.stringify({ error: 'Remediation action not found' }), { status: 404 });

  if (action.status !== 'success' && action.status !== 'executing') {
    return new Response(JSON.stringify({ error: `Cannot rollback action in status: ${action.status}` }), { status: 409 });
  }

  const rollbackPayload = buildRollbackPayload(action.action_type, action.trigger_details as Record<string, unknown>);
  if (!rollbackPayload) {
    return new Response(JSON.stringify({ error: `Rollback not supported for action type: ${action.action_type}` }), { status: 400 });
  }

  const { data: job, error: jobErr } = await supabase.from('jobs').insert({
    agent_id: action.agent_id, agent_name: action.agent_name, tenant_id: action.tenant_id,
    type: 'service_health_check', status: 'pending',
    payload: { ...rollbackPayload, is_rollback: true, original_action_id: action_id },
    priority: 2, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select('id').single();

  if (jobErr) throw new Error(`Failed to create rollback job: ${jobErr.message}`);

  await supabase.from('auto_remediation_actions').update({
    status: 'rolled_back',
    result: { ...(action.result as Record<string, unknown> || {}), rollback_job_id: job?.id, rolled_back_at: new Date().toISOString(), rolled_back_by: userId },
  }).eq('id', action_id);

  await supabase.from('auto_remediation_actions').insert({
    tenant_id: action.tenant_id, agent_id: action.agent_id, agent_name: action.agent_name,
    action_type: action.action_type, trigger_source: `rollback:${action.trigger_source}`,
    trigger_details: { original_action_id: action_id, rollback: true },
    status: 'executing', executed_at: new Date().toISOString(), result: { rollback_job_id: job?.id },
  });

  await supabase.from('system_alerts').insert({
    tenant_id: action.tenant_id, agent_id: action.agent_id,
    alert_type: 'remediation_rollback', severity: 'medium',
    title: 'Rollback de Remediacao Executado',
    message: `Acao "${action.action_type}" revertida no agente "${action.agent_name}"`,
    details: { original_action_id: action_id, rollback_job_id: job?.id },
  });

  await createAuditLog({
    supabase, tenantId: action.tenant_id, userId: userId!,
    action: 'remediation_rollback', resourceType: 'auto_remediation_actions', resourceId: action_id,
    details: { action_type: action.action_type, rollback_job_id: job?.id },
    request: req, success: true,
  });

  return { success: true, rollback_job_id: job?.id, original_action_id: action_id, message: `Rollback initiated for "${action.action_type}" on agent "${action.agent_name}"` };
});

function buildRollbackPayload(actionType: string, details: Record<string, unknown>) {
  switch (actionType) {
    case 'enable_firewall': return { action: 'rollback_firewall', reason: 'rollback_auto_remediation', original_action: 'enable_firewall' };
    case 'enable_antivirus': return { action: 'rollback_antivirus', reason: 'rollback_auto_remediation', original_action: 'enable_antivirus' };
    case 'kill_process': return { action: 'restart_service', service_name: details.process_name || details.service_name, reason: 'rollback_kill_process' };
    case 'block_usb_device': return { action: 'unblock_usb_device', device_id: details.device_id, reason: 'rollback_usb_block' };
    case 'firewall_block': return { action: 'firewall_unblock', ip_address: details.ip_address, port: details.port, reason: 'rollback_firewall_block' };
    default: return null;
  }
}
