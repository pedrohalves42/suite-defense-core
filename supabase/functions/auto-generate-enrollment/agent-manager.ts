/**
 * Agent creation, re-enrollment, and token management.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { logSecurityEvent } from '../_shared/security-log.ts';
import { sha256Hex } from './key-generator.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface AgentManagerParams {
  supabase: SupabaseClient;
  requestId: string;
  userId: string;
  tenantId: string;
  agentName: string;
  platform: string;
  hmacSecret: string;
  ipAddress: string;
  origin: string | null;
}

interface AgentResult {
  agentId: string;
  error?: Response;
}

/** Check if agent exists and handle re-enrollment or creation */
export async function resolveOrCreateAgent(params: AgentManagerParams): Promise<AgentResult> {
  const { supabase, requestId, userId, tenantId, agentName, platform, hmacSecret, ipAddress, origin } = params;

  const { data: existingAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('agent_name', agentName)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existingAgent) {
    logger.info(`[${requestId}] Re-enrolling existing agent`, { agentId: existingAgent.id });

    const { error: updateError } = await supabase
      .from('agents')
      .update({ hmac_secret: hmacSecret, os_type: platform })
      .eq('id', existingAgent.id);

    if (updateError) {
      logger.error(`[${requestId}] Failed to update HMAC secret`, updateError);
      throw updateError;
    }

    // Deactivate old tokens
    const { error: deactivateError } = await supabase
      .from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', existingAgent.id);

    if (deactivateError) {
      logger.warn(`[${requestId}] Failed to deactivate old tokens`, deactivateError);
    }

    return { agentId: existingAgent.id };
  }

  // Create new agent
  logger.info(`[${requestId}] Creating new agent`, { agentName });
  const { data: newAgent, error: agentError } = await supabase
    .from('agents')
    .insert({
      agent_name: agentName,
      tenant_id: tenantId,
      hmac_secret: hmacSecret,
      status: 'pending',
      enrolled_at: new Date().toISOString(),
      os_type: platform,
    })
    .select('id')
    .maybeSingle();

  if (agentError || !newAgent) {
    logger.error(`[${requestId}] Failed to create agent`, {
      error: agentError?.message,
      code: agentError?.code,
      agentName,
      tenantId,
    });

    const userMessage = mapAgentError(agentError, agentName);

    await logSecurityEvent({
      supabase,
      tenantId,
      userId,
      ipAddress,
      endpoint: 'auto_generate_enrollment',
      attackType: 'unauthorized',
      severity: 'critical',
      blocked: true,
      details: { error: agentError?.message, code: agentError?.code, agentName, userMessage },
      requestId,
    });

    return {
      agentId: '',
      error: new Response(
        JSON.stringify({
          error: userMessage,
          details: agentError?.message,
          code: agentError?.code,
          requestId,
          timestamp: new Date().toISOString(),
        }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      ),
    };
  }

  logger.success(`[${requestId}] Agent created successfully - ${agentName} (${newAgent.id})`);
  return { agentId: newAgent.id };
}

/** Create agent token with hash and prefix */
export async function createAgentToken(
  supabase: SupabaseClient,
  agentId: string,
  agentToken: string,
  requestId: string,
): Promise<void> {
  const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
  const tokenHash = await sha256Hex(agentToken);
  const tokenPrefix = agentToken.substring(0, 8);

  const { error: tokenError } = await supabase
    .from('agent_tokens')
    .insert({
      agent_id: agentId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      expires_at: tokenExpiresAt.toISOString(),
      is_active: true,
    });

  if (tokenError) {
    logger.error(`[${requestId}] Failed to create agent token`, { error: tokenError.message, agentId });
    if (tokenError.code === '23505') {
      throw new Error('A token collision occurred. Please try again.');
    }
    throw new Error(`Failed to create agent token: ${tokenError.message}`);
  }
}

/** Link enrollment key to agent (without plaintext token - SEC-002) */
export async function linkEnrollmentKey(
  supabase: SupabaseClient,
  enrollmentKeyHash: string,
  agentId: string,
  agentName: string,
  requestId: string,
): Promise<void> {
  const { error: linkError } = await supabase
    .from('enrollment_keys')
    .update({
      agent_id: agentId,
      used_by_agent: agentName,
      used_at: new Date().toISOString(),
    })
    .eq('key_hash', enrollmentKeyHash);

  if (linkError) {
    logger.warn(`[${requestId}] Failed to link enrollment key`, linkError);
  }
}

function mapAgentError(error: { code?: string; message?: string } | null, agentName: string): string {
  if (!error) return 'Failed to create agent';
  switch (error.code) {
    case '23505': return `Agent name "${agentName}" already exists. Please choose a different name.`;
    case '23503': return 'Invalid tenant ID or foreign key constraint violation.';
    case '23514': return 'Agent data validation failed. Please check your input.';
    case '23502': return 'Missing required fields for agent creation. Please contact support.';
    case '42703': return 'Database schema error. The agents table may be missing required columns. Please contact support.';
    default:
      if (error.message?.includes('unique')) return `Agent name "${agentName}" is already in use.`;
      return 'Failed to create agent';
  }
}
