/**
 * Approval request creation and notification for semi_automatic playbooks
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import type { PlaybookAction } from './types.ts';

export async function handleSemiAutomaticApproval(
  supabase: SupabaseClient,
  tenantId: string,
  executionId: string,
  playbook: Record<string, unknown>,
  actionsSnapshot: Array<{ action_type: string; label: string; risk_level: string; id: string; order_index: number; description: string; action_payload: Record<string, unknown> }>,
  triggerType: string,
  agentId: string | null,
  agentInfo: Record<string, unknown> | null,
  origin: string | null,
): Promise<Response | null> {
  logger.info(`[evaluate-playbook-triggers] SEMI_AUTOMATIC: Creating approval request for ${playbook.name}`);

  const MAX_PENDING_APPROVALS_PER_TENANT = 10;
  const { count: pendingCount, error: countError } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (!countError && (pendingCount || 0) >= MAX_PENDING_APPROVALS_PER_TENANT) {
    logger.warn(`[SECURITY] Tenant ${tenantId} exceeded pending approval limit (${pendingCount}/${MAX_PENDING_APPROVALS_PER_TENANT})`);
    await supabase.from('audit_logs').insert({ tenant_id: tenantId, action: 'approval_rate_limit_exceeded', resource_type: 'approval_request', resource_id: executionId, success: false, details: { pending_count: pendingCount, max_allowed: MAX_PENDING_APPROVALS_PER_TENANT, trigger_type, playbook_id: playbook.id, playbook_name: playbook.name, blocked: true } });
    return new Response(JSON.stringify({ error: 'Too many pending approval requests', message: `Maximum ${MAX_PENDING_APPROVALS_PER_TENANT} pending approvals allowed.`, pending_count: pendingCount, max_allowed: MAX_PENDING_APPROVALS_PER_TENANT }),
      { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const approvalToken = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);

  logger.info(`[evaluate-playbook-triggers] Generated secure approval token for execution ${executionId}`);

  const { data: approvalRequest, error: approvalError } = await supabase.from('approval_requests').insert({
    tenant_id: tenantId, playbook_execution_id: executionId, action_type: 'execute_playbook',
    action_payload: { playbook_id: playbook.id, playbook_name: playbook.name, playbook_version: playbook.version, execution_id: executionId, actions: actionsSnapshot.map(a => ({ action_type: a.action_type, label: a.label, risk_level: a.risk_level })), trigger_type, agent_id: agentId, agent_info: agentInfo },
    requested_by: null, status: 'pending', required_approvers: 1,
    expires_at: expiresAt.toISOString(), approval_token: approvalToken, approval_token_expires_at: tokenExpiresAt.toISOString(),
  }).select('id, approval_token').single();

  if (approvalError) {
    logger.error('[evaluate-playbook-triggers] Error creating approval request:', approvalError);
  } else {
    logger.info(`[evaluate-playbook-triggers] Created approval request ${approvalRequest?.id} with 24h timeout`);

    // System alert
    await supabase.from('system_alerts').insert({ tenant_id: tenantId, agent_id: agentId || null, alert_type: 'playbook_approval_required', severity: playbook.severity === 'critical' ? 'critical' : 'warning', message: `Playbook "${playbook.name}" requer aprovacao. Expira em 24h.`, metadata: { playbook_id: playbook.id, playbook_name: playbook.name, execution_id: executionId, approval_request_id: approvalRequest?.id, expires_at: expiresAt.toISOString(), has_approval_token: !!approvalRequest?.approval_token } });

    // Email notification
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      const approvalUrl = `${SUPABASE_URL}/functions/v1/approve-via-token?token=${approvalRequest?.approval_token}`;

      await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET || '' },
        body: JSON.stringify({ channel: 'all', alertType: 'playbook_approval_required', severity: playbook.severity === 'critical' ? 'critical' : 'warning', title: `Aprovacao necessaria: ${playbook.name}`, message: `O playbook "${playbook.name}" foi disparado automaticamente e requer aprovacao humana.`, details: { playbook_id: playbook.id, playbook_name: playbook.name, playbook_version: playbook.version, execution_id: executionId, approval_request_id: approvalRequest?.id, trigger_type, agent_id: agentId, agent_info: agentInfo, expires_at: expiresAt.toISOString(), actions: actionsSnapshot.map(a => ({ type: a.action_type, label: a.label, risk: a.risk_level })), approval_url: approvalUrl, approval_token: approvalRequest?.approval_token }, tenantId }),
      });
      logger.info(`[evaluate-playbook-triggers] Email notification sent with one-click approval link`);
    } catch (notifyError) {
      logger.error('[evaluate-playbook-triggers] Failed to send email notification:', notifyError);
    }
  }

  return null; // No error response
}
