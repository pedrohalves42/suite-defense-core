/**
 * activate-agent-honeypot — Flip a real agent into honeypot mode.
 * 
 * Via serveTenant (admin only).
 * - Checks kill switch (HONEYPOT_ENABLED feature flag)
 * - Validates 24h cooldown (no flip/revert within 24h)
 * - Updates honeypot_mode to 'flipped'
 * - Sets activation metadata + state change timestamp
 * - Does NOT revoke the token (agent continues authenticating normally)
 * - Records in audit_logs
 * - Reason is mandatory (min 5 chars)
 * - Step-up auth enforced via X-Step-Up-Verified header
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
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
      JSON.stringify({ error: 'Step-up authentication required for honeypot activation', code: 'STEP_UP_REQUIRED' }),
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

  // 1. Verify agent belongs to tenant
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

  if (agent.honeypot_mode !== 'none') {
    return new Response(
      JSON.stringify({ error: `Agent already in honeypot mode: ${agent.honeypot_mode}` }),
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

  // 3. Flip to honeypot mode — token is NOT revoked
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('agents')
    .update({
      honeypot_mode: 'flipped',
      honeypot_activated_at: now,
      honeypot_activated_by: userId,
      honeypot_reason: reason,
      last_honeypot_state_change_at: now,
    })
    .eq('id', agentId);

  if (updateError) {
    console.error(`[activate-honeypot] Update error: ${updateError.message}`);
    return new Response(
      JSON.stringify({ error: 'Failed to activate honeypot mode' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 4. Audit log (immutable trail)
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
