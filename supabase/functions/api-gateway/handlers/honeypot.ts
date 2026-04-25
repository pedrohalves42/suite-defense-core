/**
 * Honeypot handlers — activate/revert flipped honeypot agents.
 * Inlined from activate-agent-honeypot and revert-agent-honeypot (Phase 1B).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashToken } from '../../_shared/token-hash.ts';
import { isKillSwitchEnabled } from '../../_shared/feature-flags.ts';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

/** 24 hour cooldown between state changes */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function errRes(error: string, status: number, extra?: Record<string, unknown>) {
  return { error, __status: status, ...extra };
}

export async function handleActivateAgentHoneypot(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
  ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = ctx?.tenantId || (payload.tenant_id as string);
  const userId = ctx?.userId;

  // === KILL SWITCH ===
  const honeypotEnabled = await isKillSwitchEnabled(supabase, 'HONEYPOT_ENABLED', tenantId);
  if (!honeypotEnabled) return errRes('Honeypot feature is currently disabled', 503);

  // === FLIPPED MODE FLAG ===
  const flippedEnabled = await isKillSwitchEnabled(supabase, 'HONEYPOT_FLIPPED_ENABLED', tenantId);
  if (!flippedEnabled) return errRes('Honeypot flipping is currently disabled', 503);

  // === STEP-UP AUTH ===
  const stepUpVerified = ctx?.req?.headers.get('X-Step-Up-Verified');
  if (stepUpVerified !== 'true') {
    return errRes('Step-up authentication required for honeypot activation', 403, { code: 'STEP_UP_REQUIRED' });
  }

  const agentId = payload.agent_id as string;
  const reason = (payload.reason as string)?.trim();

  if (!agentId) return errRes('agent_id is required', 400);
  if (!reason || reason.length < 5) return errRes('reason is required (min 5 characters)', 400);

  // 1. Verify agent belongs to tenant
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, honeypot_mode, agent_name, last_honeypot_state_change_at')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (agentError || !agent) return errRes('Agent not found in this tenant', 404);
  if (agent.honeypot_mode !== 'none') return errRes(`Agent already in honeypot mode: ${agent.honeypot_mode}`, 409);

  // 2. Check 24h cooldown
  if (agent.last_honeypot_state_change_at) {
    const elapsed = Date.now() - new Date(agent.last_honeypot_state_change_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      return errRes(`Cooldown active. ${Math.ceil((COOLDOWN_MS - elapsed) / 60000)} minutes remaining before next state change.`, 429);
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
    logger.error(`[activate-honeypot] Update error`, { message: updateError.message });
    return errRes('Failed to activate honeypot mode', 500);
  }

  // 4. Audit log
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: 'honeypot_activated',
    resource_type: 'agent',
    resource_id: agentId,
    details: { reason, agent_name: agent.agent_name, mode: 'flipped' },
    ip_address: ctx?.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  });

  return {
    success: true,
    agent_id: agentId,
    honeypot_mode: 'flipped',
    message: 'Agent flipped to honeypot mode. Token preserved for observation.',
  };
}

export async function handleRevertAgentHoneypot(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
  ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = ctx?.tenantId || (payload.tenant_id as string);
  const userId = ctx?.userId;

  // === KILL SWITCH ===
  const honeypotEnabled = await isKillSwitchEnabled(supabase, 'HONEYPOT_ENABLED', tenantId);
  if (!honeypotEnabled) return errRes('Honeypot feature is currently disabled', 503);

  // === STEP-UP AUTH ===
  const stepUpVerified = ctx?.req?.headers.get('X-Step-Up-Verified');
  if (stepUpVerified !== 'true') {
    return errRes('Step-up authentication required for honeypot reversion', 403, { code: 'STEP_UP_REQUIRED' });
  }

  const agentId = payload.agent_id as string;
  const reason = (payload.reason as string)?.trim();

  if (!agentId) return errRes('agent_id is required', 400);
  if (!reason || reason.length < 5) return errRes('reason is required (min 5 characters)', 400);

  // 1. Verify agent is in honeypot mode
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, honeypot_mode, agent_name, last_honeypot_state_change_at')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (agentError || !agent) return errRes('Agent not found in this tenant', 404);
  if (agent.honeypot_mode === 'none') return errRes('Agent is not in honeypot mode', 409);

  // 2. Check 24h cooldown
  if (agent.last_honeypot_state_change_at) {
    const elapsed = Date.now() - new Date(agent.last_honeypot_state_change_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      return errRes(`Cooldown active. ${Math.ceil((COOLDOWN_MS - elapsed) / 60000)} minutes remaining before next state change.`, 429);
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
    logger.error(`[revert-honeypot] Update error`, { message: updateError.message });
    return errRes('Failed to revert honeypot mode', 500);
  }

  // 4. Invalidate ALL current tokens (mandatory rotation)
  const { error: tokenError } = await supabase
    .from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', agentId)
    .eq('is_active', true);

  if (tokenError) {
    logger.error(`[revert-honeypot] Token invalidation error`, { message: tokenError.message });
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
    logger.error(`[revert-honeypot] New token error`, { message: insertError.message });
    return errRes('Agent reverted but new token creation failed. Manual intervention required.', 500);
  }

  // 6. Audit log
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: 'honeypot_reverted',
    resource_type: 'agent',
    resource_id: agentId,
    details: { reason, agent_name: agent.agent_name, token_rotated: true, previous_mode: agent.honeypot_mode },
    ip_address: ctx?.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  });

  return {
    success: true,
    agent_id: agentId,
    honeypot_mode: 'none',
    new_token: newToken,
    message: 'Agent reverted to normal mode. Token rotated. Provide the new token to the agent.',
  };
}
