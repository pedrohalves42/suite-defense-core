/**
 * Playbook Core Handlers — Phase 1C
 * Inlined from: execute-playbook, process-playbook-trigger-logs,
 *   rollback-by-decision-event, rollback-remediation, resolve-action-policy
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import { createAuditLog } from '../../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// ── execute-playbook ────────────────────────────────────────────────────

const PlaybookSchema = z.object({
  playbook_id: z.string().uuid(),
  trigger_data: z.object({
    tenant_id: z.string().uuid(),
    agent_id: z.string().uuid().optional(),
    trigger_source: z.string().optional(),
    reason: z.string().optional(),
  }).passthrough(),
});

async function createAlert(supabase: any, playbook: Record<string, unknown>, triggerData: Record<string, unknown>) {
  const { error } = await supabase.from('system_alerts').insert({
    tenant_id: triggerData.tenant_id,
    agent_id: triggerData.agent_id || null,
    alert_type: 'playbook_execution',
    severity: playbook.severity || 'medium',
    title: `Playbook: ${playbook.name}`,
    message: `Playbook "${playbook.name}" triggered: ${triggerData.reason || 'automated response'}`,
    details: { playbook_id: playbook.id, trigger_data: triggerData },
  });
  if (error) throw new Error(error.message);
  return { alert_created: true };
}

async function collectEvidence(supabase: any, triggerData: Record<string, unknown>) {
  if (!triggerData.agent_id) return { skipped: true, reason: 'no_agent_id' };
  const { data: agent } = await supabase.from('agents').select('agent_name, tenant_id').eq('id', triggerData.agent_id).single();
  if (!agent) return { skipped: true, reason: 'agent_not_found' };
  const { data: job, error } = await supabase.from('jobs').insert({
    agent_id: triggerData.agent_id, agent_name: agent.agent_name, tenant_id: agent.tenant_id,
    type: 'software_inventory_collect', status: 'queued',
    payload: { collect_evidence: true, trigger: triggerData.reason },
    priority: 1, expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { evidence_job_created: job.id };
}

export async function handleExecutePlaybook(supabase: any, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const parsed = PlaybookSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid input', details: parsed.error.flatten().fieldErrors };

  const { playbook_id, trigger_data } = parsed.data;
  const { data: playbook, error: pbError } = await supabase.from('playbooks').select('id, name, tenant_id, description, trigger_type, trigger_config, actions, is_enabled, cooldown_seconds, last_triggered_at').eq('id', playbook_id).eq('tenant_id', trigger_data.tenant_id).eq('is_enabled', true).single();
  if (pbError || !playbook) return { __status: 404, error: 'Playbook not found or inactive' };

  logger.info('[execute-playbook] Starting execution', { requestId, playbookId: playbook_id, playbookName: playbook.name });

  const results: Array<{ action: string; success: boolean; result?: unknown; error?: string }> = [];
  const actions = [
    { action: 'create_alert', execute: () => createAlert(supabase, playbook, trigger_data) },
    { action: 'collect_evidence', execute: () => collectEvidence(supabase, trigger_data) },
  ];
  for (const action of actions) {
    try {
      const result = await action.execute();
      results.push({ action: action.action, success: true, result });
    } catch (err) {
      results.push({ action: action.action, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await supabase.from('playbook_executions').insert({
    playbook_id, tenant_id: trigger_data.tenant_id, agent_id: trigger_data.agent_id || null,
    trigger_source: trigger_data.trigger_source || 'automation', trigger_context: trigger_data,
    triggered_at: new Date().toISOString(), status: results.every(r => r.success) ? 'completed' : 'partial_failure',
    actions_taken: results, auto_executed: true, triggered_by: 'system',
    started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  });

  return { success: true, request_id: requestId, steps_executed: results.length, successful_steps: results.filter(r => r.success).length, results };
}

// ── process-playbook-trigger-logs ───────────────────────────────────────

export async function handleProcessPlaybookTriggerLogs(supabase: any, requestId: string, _payload: Record<string, unknown>): Promise<unknown> {
  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  const BATCH_SIZE = 50;

  const { data: pendingLogs, error: fetchError } = await supabase
    .from('ai_action_logs').select('id, tenant_id, action_data, created_at')
    .eq('action_type', 'playbook_trigger_evaluation').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(BATCH_SIZE);

  if (fetchError) throw fetchError;
  if (!pendingLogs || pendingLogs.length === 0) return { success: true, processed: 0, message: 'No pending logs', duration_ms: Date.now() - startTime };

  const logIds = pendingLogs.map(l => l.id);
  await supabase.from('ai_action_logs').update({ status: 'processing' }).in('id', logIds);

  const results = { success: 0, failed: 0, expired: 0, details: [] as Array<{ id: string; status: string; error?: string }> };

  for (const log of pendingLogs) {
    const actionData = log.action_data as Record<string, unknown>;
    const daysSinceCreation = (Date.now() - new Date(log.created_at).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCreation > 7) {
      await supabase.from('ai_action_logs').update({ status: 'expired', processed_at: new Date().toISOString(), error_message: `Expirado automaticamente: log com ${daysSinceCreation.toFixed(0)} dias de idade.` }).eq('id', log.id);
      results.expired++;
      results.details.push({ id: log.id, status: 'expired' });
      continue;
    }

    try {
      const triggerPayload = {
        tenant_id: actionData.tenant_id || log.tenant_id,
        trigger_type: actionData.trigger_type || 'job_failed',
        agent_id: actionData.agent_id || null,
        context: actionData,
      };
      const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'X-Internal-Secret': INTERNAL_SECRET },
        body: JSON.stringify(triggerPayload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      await supabase.from('ai_action_logs').update({ status: 'processed', processed_at: new Date().toISOString(), error_message: JSON.stringify({ triggered: result.triggered, execution_id: result.execution_id, reason: result.reason }) }).eq('id', log.id);
      results.success++;
      results.details.push({ id: log.id, status: 'processed' });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      await supabase.from('ai_action_logs').update({ status: 'failed', processed_at: new Date().toISOString(), error_message: `Erro ao processar: ${errorMsg}` }).eq('id', log.id);
      results.failed++;
      results.details.push({ id: log.id, status: 'failed', error: errorMsg });
    }
  }

  return { success: true, processed: results.success, failed: results.failed, expired: results.expired, total: pendingLogs.length, duration_ms: Date.now() - startTime };
}

// ── rollback-by-decision-event ──────────────────────────────────────────

const RollbackDecisionSchema = z.object({
  decision_event_id: z.string().uuid('decision_event_id must be a valid UUID'),
  reason: z.string().max(1000).optional(),
  tenant_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

export async function handleRollbackByDecisionEvent(supabase: any, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const parsed = RollbackDecisionSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid input', details: parsed.error.flatten().fieldErrors };

  const { decision_event_id, reason } = parsed.data;
  const tenantId = parsed.data.tenant_id;
  const userId = parsed.data.user_id;

  if (!tenantId || !userId) return { __status: 400, error: 'tenant_id and user_id are required' };

  const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
  if (!userRole) return { __status: 403, error: 'Forbidden: Only admins can rollback decisions' };

  const { data: event, error } = await supabase.from('decision_events').select('id, tenant_id, rule_code, decision_source, decision_type, action, evidence, actions_executed, created_at').eq('id', decision_event_id).eq('tenant_id', tenantId).single();
  if (error || !event) return { __status: 404, error: 'Decision event not found' };

  if (event.decision_type !== 'alert_resolution') return { __status: 400, error: 'Rollback not supported for this decision type', decision_type: event.decision_type, supported_types: ['alert_resolution'] };

  const alertId = event.evidence?.alert_id;
  if (!alertId) return { __status: 400, error: 'No alert_id in decision evidence' };

  const { count } = await supabase.from('decision_events').select('*', { count: 'exact', head: true }).eq('decision_type', 'rollback').eq('tenant_id', tenantId).filter('evidence->>original_decision_event_id', 'eq', decision_event_id);
  if (count && count > 0) return { __status: 409, error: 'Rollback already executed for this decision' };

  const { error: revertError } = await supabase.from('system_alerts').update({ resolved: false, resolved_at: null }).eq('id', alertId).eq('tenant_id', tenantId);
  if (revertError) throw revertError;

  await supabase.from('decision_events').insert({
    tenant_id: tenantId, rule_code: 'ROLLBACK', decision_source: 'human', decision_type: 'rollback', action: 'rollback_alert_resolution',
    evidence: { alert_id: alertId, original_decision_event_id: decision_event_id, original_action: event.action, original_rule_code: event.rule_code, reason: reason ?? 'Manual rollback via API', user_id: userId },
    actions_executed: [{ type: 'alert_reopened', success: true }], created_at: new Date().toISOString(),
  });

  logger.info(`[${requestId}] Rollback executed`, { decision_event_id, alertId, tenant_id: tenantId });
  return { status: 'rollback_executed', alert_id: alertId, original_decision_event_id: decision_event_id, message: 'Alert reopened and rollback decision event created' };
}

// ── rollback-remediation ────────────────────────────────────────────────

const RollbackRemSchema = z.object({
  action_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
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

export async function handleRollbackRemediation(supabase: any, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const parsed = RollbackRemSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors };

  const { action_id } = parsed.data;
  const userId = parsed.data.user_id || (payload.user_id as string);

  if (!userId) return { __status: 400, error: 'user_id is required' };

  const { data: userRoles } = await supabase.from('user_roles').select('tenant_id, role').eq('user_id', userId);
  const adminRoles = (userRoles || []).filter(r => ['admin', 'super_admin'].includes(r.role));
  if (adminRoles.length === 0) return { __status: 403, error: 'Admin role required for rollback' };

  const userTenantIds = adminRoles.map(r => r.tenant_id);
  const { data: action, error: fetchErr } = await supabase.from('auto_remediation_actions').select('id, tenant_id, agent_id, action_type, status, trigger_details, created_at').eq('id', action_id).in('tenant_id', userTenantIds).single();
  if (fetchErr || !action) return { __status: 404, error: 'Remediation action not found' };

  if (action.status !== 'success' && action.status !== 'executing') return { __status: 409, error: `Cannot rollback action in status: ${action.status}` };

  const rollbackPayload = buildRollbackPayload(action.action_type, action.trigger_details as Record<string, unknown>);
  if (!rollbackPayload) return { __status: 400, error: `Rollback not supported for action type: ${action.action_type}` };

  const { data: job, error: jobErr } = await supabase.from('jobs').insert({
    agent_id: action.agent_id, agent_name: action.agent_name, tenant_id: action.tenant_id,
    type: 'service_health_check', status: 'queued',
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

  return { success: true, rollback_job_id: job?.id, original_action_id: action_id, message: `Rollback initiated for "${action.action_type}" on agent "${action.agent_name}"` };
}

// ── resolve-action-policy ───────────────────────────────────────────────

const ActionPolicySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  insight_type: z.string().min(1).max(100),
});

interface PolicyResponse {
  source: 'tenant_policy' | 'default_mapping' | 'tenant_fallback';
  execution_mode: 'auto' | 'approval' | 'disabled';
  policy_details?: Record<string, unknown>;
}

const DEFAULT_MAPPINGS: Record<string, 'auto' | 'approval'> = {
  security_threat: 'auto', anomaly_detection: 'auto', anomaly: 'auto',
  prediction: 'approval', root_cause: 'approval', optimization: 'approval',
  agent_improdutive: 'auto', agent_recovered: 'auto', integrity_violation: 'auto', info: 'auto',
  antivirus_disabled: 'auto', antivirus_outdated: 'auto', dns_malicious_activity: 'auto',
  agent_offline_suspicious: 'auto', agent_tampering: 'auto', anomaly_stuck_jobs: 'auto',
  job_failed_recurring: 'auto', blocked_access_detected: 'auto',
  vulnerability_critical: 'approval', vulnerability_high: 'approval',
  safe_mode_prolonged: 'approval', process_anomaly: 'approval',
  data_exfiltration_suspected: 'approval', unauthorized_software: 'approval',
};

export async function handleResolveActionPolicy(supabase: any, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const parsed = ActionPolicySchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors };

  const { insight_type } = parsed.data;
  const tenantId = parsed.data.tenant_id || (payload.tenant_id as string);
  if (!tenantId) return { __status: 400, error: 'tenant_id is required' };

  logger.info(`[${requestId}] Resolving policy for tenant=${tenantId}, insight_type=${insight_type}`);

  const { data: tenantPolicy, error: policyError } = await supabase
    .from('tenant_action_policies').select('id, execution_mode')
    .eq('tenant_id', tenantId).eq('insight_type', insight_type).maybeSingle();
  if (policyError) throw policyError;

  if (tenantPolicy?.execution_mode) {
    await supabase.from('tenant_action_policies').update({ last_applied_at: new Date().toISOString() }).eq('id', tenantPolicy.id);
    return { source: 'tenant_policy', execution_mode: tenantPolicy.execution_mode, policy_details: { tenant_policy_id: tenantPolicy.id } } as PolicyResponse;
  }

  const defaultMode = DEFAULT_MAPPINGS[insight_type];
  if (defaultMode) return { source: 'default_mapping', execution_mode: defaultMode, policy_details: { default_mapping_mode: defaultMode } } as PolicyResponse;

  const { data: tenant, error: tenantError } = await supabase.from('tenants').select('auto_action_mode').eq('id', tenantId).single();
  if (tenantError) return { source: 'tenant_fallback', execution_mode: 'approval' } as PolicyResponse;

  let fallbackMode: 'auto' | 'approval' | 'disabled' = 'approval';
  if (tenant?.auto_action_mode === 'auto_full') fallbackMode = 'auto';
  else if (tenant?.auto_action_mode === 'disabled') fallbackMode = 'disabled';

  return { source: 'tenant_fallback', execution_mode: fallbackMode, policy_details: { tenant_global_mode: tenant?.auto_action_mode || 'suggest' } } as PolicyResponse;
}