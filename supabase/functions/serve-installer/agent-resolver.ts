/**
 * Agent resolution logic: find existing or auto-provision new agent
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import type { AgentData, EnrollmentData } from './types.ts';

interface ResolveResult {
  agentId: string;
  agentData: AgentData;
  error?: Response;
}

/**
 * Resolves agent: reuse existing by hostname, create new, or fetch existing by ID
 */
export async function resolveAgent(
  supabaseClient: SupabaseClient,
  enrollmentData: EnrollmentData,
  enrollmentKeyHash: string,
  url: URL,
  requestId: string,
  origin: string | null,
): Promise<ResolveResult | Response> {
  let resolvedAgentId = enrollmentData.agent_id;
  let agentData: AgentData | null = null;

  if (!resolvedAgentId) {
    const hostname = url.searchParams.get('hostname') || `agent-${crypto.randomUUID().substring(0, 8)}`;
    const osPlatform = url.searchParams.get('os_type') || 'windows';

    logger.debug(`[${requestId}] Enrollment key has no agent_id - checking for existing agent with hostname: ${hostname}`);

    // DEDUP: Check if agent with this hostname already exists
    const { data: existingByHostname } = await supabaseClient
      .from('agents')
      .select('id, agent_name, os_type, hmac_secret, status')
      .eq('agent_name', hostname)
      .eq('tenant_id', enrollmentData.tenant_id)
      .in('status', ['active', 'offline', 'inactive'])
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByHostname) {
      resolvedAgentId = existingByHostname.id;
      agentData = {
        agent_name: existingByHostname.agent_name,
        os_type: existingByHostname.os_type,
        hmac_secret: existingByHostname.hmac_secret,
      };

      if (existingByHostname.status !== 'active') {
        await supabaseClient
          .from('agents')
          .update({ status: 'active' })
          .eq('id', existingByHostname.id);
      }

      logger.debug(`[${requestId}] DEDUP: Reusing existing agent`, {
        agentId: resolvedAgentId, agentName: hostname,
        previousStatus: existingByHostname.status, tenantId: enrollmentData.tenant_id,
      });
    } else {
      logger.debug(`[${requestId}] No existing agent found - creating new agent: ${hostname}`);

      const hmacBytes = new Uint8Array(32);
      crypto.getRandomValues(hmacBytes);
      const newHmacSecret = Array.from(hmacBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const { data: newAgent, error: newAgentError } = await supabaseClient
        .from('agents')
        .insert({
          agent_name: hostname,
          tenant_id: enrollmentData.tenant_id,
          status: 'active',
          os_type: osPlatform,
          hmac_secret: newHmacSecret,
          enrolled_at: new Date().toISOString(),
          agent_version: '0.0.0',
        })
        .select('id, agent_name, os_type, hmac_secret')
        .single();

      if (newAgentError || !newAgent) {
        logger.error(`[${requestId}] Failed to auto-provision agent`, newAgentError);
        return new Response('Failed to create agent record', {
          status: 500, headers: buildCorsHeaders(origin),
        });
      }

      resolvedAgentId = newAgent.id;
      agentData = { agent_name: newAgent.agent_name, os_type: newAgent.os_type, hmac_secret: newAgent.hmac_secret };

      logger.debug(`[${requestId}] Auto-provisioned new agent`, {
        agentId: resolvedAgentId, agentName: hostname, tenantId: enrollmentData.tenant_id,
      });
    }

    // Increment usage count
    try {
      const { error: rpcErr } = await supabaseClient.rpc('increment_enrollment_key_usage', { p_key_hash: enrollmentKeyHash });
      if (rpcErr) logger.warn(`[${requestId}] Failed to increment EK usage (non-critical):`, rpcErr);
    } catch (e) {
      logger.warn(`[${requestId}] Failed to increment EK usage (non-critical):`, e);
    }
  } else {
    const { data: existingAgent, error: agentError } = await supabaseClient
      .from('agents')
      .select('agent_name, os_type, hmac_secret')
      .eq('id', resolvedAgentId)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (agentError || !existingAgent) {
      logger.debug(`[${requestId}] Agent not found: ${agentError?.message}`);
      return new Response('Agent not found', {
        status: 404, headers: buildCorsHeaders(origin),
      });
    }
    agentData = existingAgent;
  }

  return { agentId: resolvedAgentId!, agentData: agentData! };
}
