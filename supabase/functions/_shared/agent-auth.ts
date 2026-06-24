/**
 * Shared agent authentication helper.
 * Authenticates agents via X-Agent-Token header + token hash lookup.
 * Used by all agent-facing edge functions.
 *
 * D1 (Bloco D — type safety): typed end-to-end, no `any` in security path.
 * `extraAgentFields` is now restricted to existing `agents` columns via
 * `AgentExtraField`, preventing regressions like the `metadata_hash` 401 bug.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type { Database } from './database.types.ts';
import { hashToken } from './token-hash.ts';
import { corsHeaders } from './cors.ts';
import { logger } from './logger.ts';

/** Full row type for the public.agents table (source of truth from generated types). */
type AgentRow = Database['public']['Tables']['agents']['Row'];

/** Fields always selected from agents (base shape consumed by authenticateAgent). */
type AgentBaseField =
  | 'id'
  | 'agent_name'
  | 'tenant_id'
  | 'hmac_secret'
  | 'honeypot_mode'
  | 'status';

/**
 * Allowed extra fields for `extraAgentFields`.
 *
 * Restricted to columns that actually exist on public.agents.
 * Adding a non-existent column here (e.g. `'metadata_hash'`) is a typecheck
 * error — this is the guard against the regression that produced silent 401s.
 */
export type AgentExtraField = Exclude<keyof AgentRow, AgentBaseField>;

/** Shape of the embedded `agents` object returned by the agent_tokens select. */
type EmbeddedAgent = Pick<AgentRow, AgentBaseField> & Partial<AgentRow>;

/** Row shape from the agent_tokens lookup with `agents!inner(...)`. */
interface TokenWithAgent {
  agent_id: string;
  expires_at: string | null;
  agents: EmbeddedAgent | EmbeddedAgent[];
}

/** Minimal row used by the fallback resolution path (best-effort audit). */
interface AnyTokenRow {
  agent_id: string | null;
  is_active: boolean | null;
  expires_at: string | null;
}

export interface AuthenticatedAgent {
  id: string;
  agent_name: string;
  tenant_id: string;
  hmac_secret: string | null;
}

export type AgentAuthResult =
  | {
      success: true;
      agent: AuthenticatedAgent;
      /** Extra agent fields requested via extraAgentFields option. */
      agentData: Record<string, unknown>;
    }
  | {
      success: false;
      response: Response;
    };

export interface AuthenticateAgentOptions {
  /** Additional columns to select from the agents table beyond the defaults. */
  extraAgentFields?: ReadonlyArray<AgentExtraField>;
}

// Declare EdgeRuntime for Deno/Supabase environment
declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

/** Narrow Postgrest-style response used by the fire-and-forget insert. */
interface PostgrestLikeResponse {
  error: { message?: string } | null;
}

/**
 * Fire-and-forget audit insert into token_validation_failures.
 * Closes the observability gap on agent 401/403: every rejection is recorded
 * with token prefix, detected reason, IP and UA. Best-effort; never throws.
 */
function recordTokenFailure(
  supabase: SupabaseClient<Database>,
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
      .then((res: PostgrestLikeResponse) => {
        if (res?.error) {
          logger.warn(`[${endpoint}] token_validation_failures insert failed`, {
            message: res.error.message,
          });
        }
      })
      .catch((e: unknown) => {
        logger.warn(`[${endpoint}] token_validation_failures insert threw`, {
          message: e instanceof Error ? e.message : String(e),
        });
      });

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(work);
    }
    // else: local/dev — drop the promise; we already logged via logger.warn above.
  } catch (e: unknown) {
    logger.warn(`[${endpoint}] recordTokenFailure threw`, {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Normalize the embedded agents payload (PostgREST may return array or object). */
function unwrapEmbeddedAgent(agents: EmbeddedAgent | EmbeddedAgent[]): EmbeddedAgent {
  return Array.isArray(agents) ? agents[0] : agents;
}

export async function authenticateAgent(
  supabase: SupabaseClient<Database>,
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      ),
    };
  }

  const tokenPrefix = agentToken.substring(0, 8);

  // Optimization: Skip hashing if it's clearly a JWT (hashing is CPU intensive)
  if (agentToken.split('.').length === 3) {
    logger.debug(`[${endpoint}] Token looks like a JWT, skipping hash lookup for agent_tokens`);
    recordTokenFailure(supabase, req, endpoint, tokenPrefix, 'jwt_token_rejected');
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Agent tokens cannot be JWTs' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      ),
    };
  }

  const tokenHash = await hashToken(agentToken);

  // Build select fields: base fields + any extra requested.
  // `extraAgentFields` is statically restricted to AgentExtraField, so a typo
  // or a column that does not exist on `agents` is rejected by the typechecker.
  const baseFields: ReadonlyArray<AgentBaseField> = [
    'id',
    'agent_name',
    'tenant_id',
    'hmac_secret',
    'honeypot_mode',
    'status',
  ];
  const baseFieldsSet: ReadonlySet<string> = new Set(baseFields);
  const extras = (options?.extraAgentFields ?? []).filter(
    (f) => !baseFieldsSet.has(f),
  );
  const agentSelectColumns = [...baseFields, ...extras].join(', ');
  const agentSelect = `agent_id, expires_at, agents!inner(${agentSelectColumns})`;

  const { data: tokenRaw, error: tokenError } = await supabase
    .from('agent_tokens')
    .select(agentSelect)
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle();

  const token = tokenRaw as TokenWithAgent | null;

  if (tokenError || !token?.agents) {
    logger.warn(`[${endpoint}] Invalid agent token attempt, prefix: ${tokenPrefix}`);
    // Best-effort: try to resolve agent_id from any matching token row (inactive included)
    let resolvedAgentId: string | null = null;
    let tokenState: string = 'not_found';
    try {
      const { data: anyTokRaw } = await supabase
        .from('agent_tokens')
        .select('agent_id, is_active, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      const anyTok = anyTokRaw as AnyTokenRow | null;
      if (anyTok) {
        resolvedAgentId = anyTok.agent_id ?? null;
        tokenState = anyTok.is_active === false ? 'inactive' : 'hash_mismatch_or_inactive';
      }
    } catch { /* ignore */ }
    recordTokenFailure(supabase, req, endpoint, tokenPrefix, 'invalid_or_inactive_token', {
      agent_id: resolvedAgentId,
      token_state: tokenState,
      db_error: tokenError?.message || null,
    });
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      ),
    };
  }

  // HARDENED: Check token expiration (propagates to all serveAgent endpoints)
  const expiresAt = token.expires_at;
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    const LEEWAY_MS = 60000; // 60 seconds leeway for clock drift
    if (expiryDate.getTime() + LEEWAY_MS < Date.now()) {
      logger.warn(`[${endpoint}] Expired agent token, prefix: ${tokenPrefix}, expired: ${expiresAt}`);
      const agentForExpired = unwrapEmbeddedAgent(token.agents);
      recordTokenFailure(supabase, req, endpoint, tokenPrefix, 'token_expired', {
        agent_id: agentForExpired?.id ?? token.agent_id ?? null,
        tenant_id: agentForExpired?.tenant_id ?? null,
        expires_at: expiresAt,
      });
      return {
        success: false,
        response: new Response(
          JSON.stringify({ error: 'Token has expired', code: 'TOKEN_EXPIRED' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }
  }

  const agent = unwrapEmbeddedAgent(token.agents);

  // HARDENED: Check agent status
  const status = agent.status;
  if (status === 'retired' || status === 'blocked' || status === 'suspended') {
    logger.error(
      `[${endpoint}] Blocked agent access attempt. Name: ${agent.agent_name}, Status: ${status}`,
    );
    recordTokenFailure(supabase, req, endpoint, tokenPrefix, `agent_blocked:${status}`, {
      agent_id: agent.id ?? null,
      tenant_id: agent.tenant_id ?? null,
      agent_name: agent.agent_name ?? null,
    });
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: `Agent is ${status}`, code: 'AGENT_BLOCKED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      ),
    };
  }

  // Extract extra fields into agentData (everything beyond the base 6, including honeypot_mode)
  const agentObj = agent as Record<string, unknown>;
  const { id, agent_name, tenant_id, hmac_secret, honeypot_mode, ...extraData } = agentObj;

  return {
    success: true,
    agent: {
      id: id as string,
      agent_name: agent_name as string,
      tenant_id: tenant_id as string,
      hmac_secret: (hmac_secret as string | null) ?? null,
    },
    agentData: { honeypot_mode, status, ...extraData },
  };
}
