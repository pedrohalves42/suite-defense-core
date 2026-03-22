/**
 * Shared agent authentication helper.
 * Authenticates agents via X-Agent-Token header + token hash lookup.
 * Used by all agent-facing edge functions.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashToken } from './token-hash.ts';
import { corsHeaders } from './cors.ts';

export interface AuthenticatedAgent {
  id: string;
  agent_name: string;
  tenant_id: string;
  hmac_secret: string | null;
}

export type AgentAuthResult = {
  success: true;
  agent: AuthenticatedAgent;
} | {
  success: false;
  response: Response;
};

/**
 * Authenticates an agent via X-Agent-Token header.
 * Returns the agent info or an error response.
 */
export async function authenticateAgent(
  supabase: SupabaseClient,
  req: Request,
  endpoint: string,
): Promise<{ success: true; agent: AuthenticatedAgent } | { success: false; response: Response }> {
  const agentToken = req.headers.get('X-Agent-Token');

  if (!agentToken) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'X-Agent-Token header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const tokenHash = await hashToken(agentToken);
  const { data: token, error: tokenError } = await supabase
    .from('agent_tokens')
    .select('agent_id, expires_at, agents!inner(id, agent_name, tenant_id, hmac_secret)')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle();

  if (tokenError || !token?.agents) {
    console.warn(`[${endpoint}] Invalid agent token attempt, prefix: ${agentToken.substring(0, 8)}`);
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  // HARDENED: Check token expiration (propagates to all serveAgent endpoints)
  const expiresAt = (token as any).expires_at;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    console.warn(`[${endpoint}] Expired agent token, prefix: ${agentToken.substring(0, 8)}, expired: ${expiresAt}`);
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Token has expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents;

  return {
    success: true,
    agent: {
      id: agent.id,
      agent_name: agent.agent_name,
      tenant_id: agent.tenant_id,
      hmac_secret: agent.hmac_secret,
    },
  };
}
