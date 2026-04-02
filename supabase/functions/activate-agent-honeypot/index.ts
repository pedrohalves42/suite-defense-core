/**
 * activate-agent-honeypot — Flip a real agent into honeypot mode.
 * 
 * Via serveTenant (admin only).
 * - Updates honeypot_mode to 'flipped'
 * - Sets activation metadata
 * - Does NOT revoke the token (agent continues authenticating normally)
 * - Records in audit_logs
 */

import { serveTenant } from '../_shared/serve-tenant.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId } = ctx;
  const body = ctx.body as { agent_id?: string; reason?: string };

  if (!body.agent_id) {
    return new Response(
      JSON.stringify({ error: 'agent_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const agentId = body.agent_id;
  const reason = body.reason || 'Manual activation';

  // 1. Verify agent belongs to tenant and is not already a honeypot
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, honeypot_mode, agent_name')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (agentError || !agent) {
    return new Response(
      JSON.stringify({ error: 'Agent not found in this tenant' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (agent.honeypot_mode !== 'none') {
    return new Response(
      JSON.stringify({ error: `Agent already in honeypot mode: ${agent.honeypot_mode}` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. Flip to honeypot mode — token is NOT revoked
  const { error: updateError } = await supabase
    .from('agents')
    .update({
      honeypot_mode: 'flipped',
      honeypot_activated_at: new Date().toISOString(),
      honeypot_activated_by: userId,
      honeypot_reason: reason,
    })
    .eq('id', agentId);

  if (updateError) {
    console.error(`[activate-honeypot] Update error: ${updateError.message}`);
    return new Response(
      JSON.stringify({ error: 'Failed to activate honeypot mode' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Audit log
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: 'honeypot_activated',
    resource_type: 'agent',
    resource_id: agentId,
    details: { reason, agent_name: agent.agent_name, mode: 'flipped' },
    ip_address: _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  });

  return {
    success: true,
    agent_id: agentId,
    honeypot_mode: 'flipped',
    message: 'Agent flipped to honeypot mode. Token preserved for observation.',
  };
});
