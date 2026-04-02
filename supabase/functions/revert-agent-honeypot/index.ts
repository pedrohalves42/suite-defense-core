/**
 * revert-agent-honeypot — Revert a flipped agent back to normal mode.
 * 
 * Via serveTenant (admin only).
 * - Checks kill switch (HONEYPOT_ENABLED feature flag)
 * - Validates 24h cooldown
 * - Step-up auth enforced via X-Step-Up-Verified header
 * - Reverts honeypot_mode to 'none'
 * - Invalidates ALL current tokens (is_active = false)
 * - Generates a new token (mandatory rotation on recovery)
 * - Records in audit_logs
 * - Reason is mandatory
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { isFeatureEnabled } from '../_shared/feature-flags.ts';

/** 24 hour cooldown between state changes */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId } = ctx;
  const body = ctx.body as { agent_id?: string; reason?: string };

  // === KILL SWITCH ===
  const honeypotEnabled = await isFeatureEnabled(supabase, 'HONEYPOT_ENABLED', tenantId);
  if (!honeypotEnabled) {
    return new Response(
      JSON.stringify({ error: 'Honeypot feature is currently disabled' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // === STEP-UP AUTH ===
  const stepUpVerified = _req.headers.get('X-Step-Up-Verified');
  if (stepUpVerified !== 'true') {
    return new Response(
      JSON.stringify({ error: 'Step-up authentication required for honeypot reversion', code: 'STEP_UP_REQUIRED' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!body.agent_id) {
    return new Response(
      JSON.stringify({ error: 'agent_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!body.reason || body.reason.trim().length < 5) {
    return new Response(
      JSON.stringify({ error: 'reason is required (min 5 characters)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const agentId = body.agent_id;
  const reason = body.reason.trim();

  // 1. Verify agent is in honeypot mode
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, honeypot_mode, agent_name, last_honeypot_state_change_at')
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

  // 2. Check 24h cooldown
  if (agent.last_honeypot_state_change_at) {
    const lastChange = new Date(agent.last_honeypot_state_change_at).getTime();
    const elapsed = Date.now() - lastChange;
    if (elapsed < COOLDOWN_MS) {
      const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
      return new Response(
        JSON.stringify({
          error: `Cooldown active. ${remainingMin} minutes remaining before next state change.`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // 3. Revert honeypot mode
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('agents')
    .update({
      honeypot_mode: 'none',
      honeypot_activated_at: null,
      honeypot_activated_by: null,
      honeypot_reason: null,
      last_honeypot_state_change_at: now,
    })
    .eq('id', agentId);

  if (updateError) {
    console.error(`[revert-honeypot] Update error: ${updateError.message}`);
    return new Response(
      JSON.stringify({ error: 'Failed to revert honeypot mode' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 4. Invalidate ALL current tokens (mandatory rotation)
  const { error: tokenError } = await supabase
    .from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', agentId)
    .eq('is_active', true);

  if (tokenError) {
    console.error(`[revert-honeypot] Token invalidation error: ${tokenError.message}`);
  }

  // 5. Generate new token
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
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (insertError) {
    console.error(`[revert-honeypot] New token error: ${insertError.message}`);
    return new Response(
      JSON.stringify({ error: 'Agent reverted but new token creation failed. Manual intervention required.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 6. Audit log (immutable trail)
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: 'honeypot_reverted',
    resource_type: 'agent',
    resource_id: agentId,
    details: { reason, agent_name: agent.agent_name, token_rotated: true, previous_mode: agent.honeypot_mode },
    ip_address: _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  });

  return {
    success: true,
    agent_id: agentId,
    honeypot_mode: 'none',
    new_token: newToken,
    message: 'Agent reverted to normal mode. Token rotated. Provide the new token to the agent.',
  };
});
