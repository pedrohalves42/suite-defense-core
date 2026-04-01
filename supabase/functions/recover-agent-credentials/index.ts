/**
 * recover-agent-credentials — Regenerates fresh credentials for an agent.
 * Migrated to serveTenant middleware.
 *
 * Auth: JWT with admin/operator/super_admin role (handled by middleware).
 * POST /functions/v1/recover-agent-credentials
 * Body: { "agent_name": "pcteste1" }
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RecoverCredsSchema = z.object({
  agent_name: z.string().trim().min(1).max(100),
});

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId, body: rawBody, isInternal } = ctx;

  const parsed = RecoverCredsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const agentName = parsed.data.agent_name;

  // Check role — middleware already validated JWT + tenant access
  // But we still need admin/operator/super_admin check
  if (!isInternal && userId) {
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const allowedRoles = ['admin', 'operator', 'super_admin'];
    if (!userRole || !allowedRoles.includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: insufficient permissions' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  logger.info(`[${requestId}] Recovery request for agent: ${agentName}`);

  // Find agent — tenant isolation enforced via tenantId from middleware
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, agent_name, hmac_secret, tenant_id')
    .eq('agent_name', agentName)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (agentError || !agent) {
    logger.warn(`[${requestId}] Agent not found: ${agentName}`);
    return new Response(
      JSON.stringify({ error: 'Agent not found in your tenant' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Generate fresh token
  const freshToken = crypto.randomUUID();
  const tokenHash = await hashToken(freshToken);
  const tokenPrefix = freshToken.substring(0, 8);

  // Deactivate old tokens
  await supabase
    .from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', agent.id);

  // Create new token
  const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: tokenError } = await supabase
    .from('agent_tokens')
    .insert({
      agent_id: agent.id,
      tenant_id: agent.tenant_id,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      expires_at: tokenExpiresAt,
      is_active: true,
    });

  if (tokenError) {
    logger.error(`[${requestId}] Token creation failed:`, tokenError);
    return new Response(
      JSON.stringify({ error: 'Failed to generate credentials' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'recover_agent_credentials',
    resource_type: 'agent',
    resource_id: agent.id,
    tenant_id: agent.tenant_id,
    details: {
      agent_name: agentName,
      token_prefix: tokenPrefix,
      reason: 'reinstall_preserve_recovery',
    },
    success: true,
  });

  logger.info(`[${requestId}] Credentials recovered for ${agentName} (prefix: ${tokenPrefix})`);

  return {
    agentToken: freshToken,
    hmacSecret: agent.hmac_secret,
    agentName: agent.agent_name,
  };
});
