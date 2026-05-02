/**
 * Shared agent authentication helper.
 * Authenticates agents via X-Agent-Token header + token hash lookup.
 * Used by all agent-facing edge functions.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashToken } from './token-hash.ts';
import { corsHeaders } from './cors.ts';
import { logger } from './logger.ts';

export interface AuthenticatedAgent {
  id: string;
  agent_name: string;
  tenant_id: string;
  hmac_secret: string | null;
}

export type AgentAuthResult = {
  success: true;
  agent: AuthenticatedAgent;
  /** Extra agent fields requested via extraAgentFields option */
  agentData: Record<string, unknown>;
} | {
  success: false;
  response: Response;
};

export interface AuthenticateAgentOptions {
  /** Additional columns to select from the agents table beyond the defaults */
  extraAgentFields?: string[];
}

/**
 * Authenticates an agent via X-Agent-Token header.
 * Returns the agent info or an error response.
 * 
 * @param options.extraAgentFields - Additional agent columns to fetch (e.g. ['status', 'agent_version'])
 */
export async function authenticateAgent(
  supabase: any,
  req: Request,
  endpoint: string,
  options?: AuthenticateAgentOptions,
): Promise<AgentAuthResult> {
  let agentToken = req.headers.get('X-Agent-Token');

  // Fallback to Authorization: Bearer <token>
  if (!agentToken) {
    const auth = req.headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) {
      agentToken = auth.slice(7);
    }
  }

  if (!agentToken) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'X-Agent-Token header or Authorization: Bearer required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const tokenHash = await hashToken(agentToken);
  
  // Build select fields: base fields + any extra requested
  const baseFields = 'id, agent_name, tenant_id, hmac_secret, honeypot_mode, status';
  const extraFields = options?.extraAgentFields?.length 
    ? ', ' + options.extraAgentFields.filter(f => f !== 'status').join(', ')
    : '';
  const agentSelect = `agent_id, expires_at, agents!inner(${baseFields}${extraFields})`;
  
  const { data: tokenRaw, error: tokenError } = await supabase
    .from('agent_tokens')
    .select(agentSelect)
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle();

  const token = tokenRaw as { agents?: unknown; expires_at?: string | null } | null;

  if (tokenError || !token?.agents) {
    logger.warn(`[${endpoint}] Invalid agent token attempt, prefix: ${agentToken.substring(0, 8)}`);
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  // HARDENED: Check token expiration (propagates to all serveAgent endpoints)
  const expiresAt = token.expires_at as string | null;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    logger.warn(`[${endpoint}] Expired agent token, prefix: ${agentToken.substring(0, 8)}, expired: ${expiresAt}`);
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Token has expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents;

  // HARDENED: Check agent status
  const status = agent.status as string | null;
  if (status === 'retired' || status === 'blocked' || status === 'suspended') {
    logger.error(`[${endpoint}] Blocked agent access attempt. Name: ${agent.agent_name}, Status: ${status}`);
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: `Agent is ${status}`, code: 'AGENT_BLOCKED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Extract extra fields into agentData (everything beyond the base 6, including honeypot_mode)
  const agentObj = (agent || {}) as Record<string, unknown>;
  const { id, agent_name, tenant_id, hmac_secret, honeypot_mode, ...extraData } = agentObj;

  return {
    success: true,
    agent: {
      id: id as string,
      agent_name: agent_name as string,
      tenant_id: tenant_id as string,
      hmac_secret: hmac_secret as string | null,
    },
    agentData: { honeypot_mode, status, ...extraData },
  };
}
