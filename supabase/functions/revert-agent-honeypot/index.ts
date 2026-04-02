/**
 * revert-agent-honeypot — Revert a flipped agent back to normal mode.
 * 
 * Via serveTenant (admin only).
 * - Reverts honeypot_mode to 'none'
 * - Invalidates current token (is_active = false)
 * - Generates a new token (rotation on recovery)
 * - Records in audit_logs
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { hashToken } from '../_shared/token-hash.ts';

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
  const reason = body.reason || 'Manual revert';

  // 1. Verify agent is in honeypot mode
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

  if (agent.honeypot_mode === 'none') {
    return new Response(
      JSON.stringify({ error: 'Agent is not in honeypot mode' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. Revert honeypot mode
  const { error: updateError } = await supabase
    .from('agents')
    .update({
      honeypot_mode: 'none',
      honeypot_activated_at: null,
      honeypot_activated_by: null,
      honeypot_reason: null,
    })
    .eq('id', agentId);

  if (updateError) {
    console.error(`[revert-honeypot] Update error: ${updateError.message}`);
    return new Response(
      JSON.stringify({ error: 'Failed to revert honeypot mode' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Invalidate ALL current tokens for this agent
  const { error: tokenError } = await supabase
    .from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', agentId)
    .eq('is_active', true);

  if (tokenError) {
    console.error(`[revert-honeypot] Token invalidation error: ${tokenError.message}`);
  }

  // 4. Generate new token
  const newToken = crypto.randomUUID() + '-' + crypto.randomUUID();
  const tokenHash = await hashToken(newToken);
  const tokenPrefix = newToken.substring(0, 8);

  const { error: insertError } = await supabase
    .from('agent_tokens')
    .insert({
      agent_id: agentId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      is_active: true,
      tenant_id: tenantId,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    });

  if (insertError) {
    console.error(`[revert-honeypot] New token creation error: ${insertError.message}`);
    return new Response(
      JSON.stringify({ error: 'Agent reverted but new token creation failed. Manual intervention required.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 5. Audit log
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: 'honeypot_reverted',
    resource_type: 'agent',
    resource_id: agentId,
    details: { reason, agent_name: agent.agent_name, token_rotated: true },
    ip_address: _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  });

  return {
    success: true,
    agent_id: agentId,
    honeypot_mode: 'none',
    new_token: newToken, // Return ONCE for the admin to configure on the agent
    message: 'Agent reverted to normal mode. Token rotated. Provide the new token to the agent.',
  };
});
