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
// Declare EdgeRuntime for Deno/Supabase environment
declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

/**
 * Fire-and-forget audit insert into token_validation_failures.
 * Closes the observability gap on agent 401/403: every rejection is recorded
 * with token prefix, detected reason, IP and UA. Best-effort; never throws.
 */
function recordTokenFailure(
  supabase: any,
  req: Request,
  endpoint: string,
  tokenPrefix: string,
  reason: string,
  extra?: Record<string, unknown>,
): void {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || null;
    const ua = (req.headers.get('user-agent') || '').slice(0, 240) || null;
    const reasonPayload = JSON.stringify({
      endpoint,
      reason,
      ...(extra || {}),
    });
    const work = supabase
      .from('token_validation_failures')
      .insert({
        token_hash_prefix: tokenPrefix || 'unknown',
        failure_reason: reasonPayload,
        client_ip: clientIp,
        user_agent: ua,
      })
      .then((res: any) => {
        if (res?.error) {
          logger.warn(`[${endpoint}] token_validation_failures insert failed`, { message: res.error.message });
        }
      })
      .catch((e: any) => {
        logger.warn(`[${endpoint}] token_validation_failures insert threw`, { message: e?.message });
      });

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(work);
    }
    // else: local/dev — drop the promise; we already logged via logger.warn above.
  } catch (e) {
    logger.warn(`[${endpoint}] recordTokenFailure threw`, { message: (e as Error)?.message });
  }
}

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
    recordTokenFailure(supabase, req, endpoint, 'none', 'missing_token_header');
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'X-Agent-Token header or Authorization: Bearer required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Optimization: Skip hashing if it's clearly a JWT (hashing is CPU intensive)
  if (agentToken.split('.').length === 3) {
    logger.debug(`[${endpoint}] Token looks like a JWT, skipping hash lookup for agent_tokens`);
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Agent tokens cannot be JWTs' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const tokenHash = await hashToken(agentToken);
  
  // Build select fields: base fields + any extra requested
  const baseFields = 'id, agent_name, tenant_id, hmac_secret, honeypot_mode, status';
  const extraFields = options?.extraAgentFields?.length 
    ? ', ' + options.extraAgentFields.filter(f => !['status', 'id', 'agent_name', 'tenant_id', 'hmac_secret', 'honeypot_mode'].includes(f)).join(', ')
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
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    const LEEWAY_MS = 60000; // 60 seconds leeway for clock drift
    if (expiryDate.getTime() + LEEWAY_MS < Date.now()) {
      logger.warn(`[${endpoint}] Expired agent token, prefix: ${agentToken.substring(0, 8)}, expired: ${expiresAt}`);
      return {
        success: false,
        response: new Response(
          JSON.stringify({ error: 'Token has expired', code: 'TOKEN_EXPIRED' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
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
