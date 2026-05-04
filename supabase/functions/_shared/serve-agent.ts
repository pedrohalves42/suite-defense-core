// @ts-nocheck
/**
 * serveAgent() — Middleware for agent-authenticated endpoints.
 * Extracted from serve-tenant.ts for modularity.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import { logger, loggerWithContext } from './logger.ts';
import { handleExceptionWithContext } from './error-handler.ts';
import type { RateLimitOption } from './serve-tenant.ts';

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>, origin?: string | null) {
  const cors = buildCorsHeaders(origin);
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, ...securityHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function errorResponse(message: string, status: number, requestId: string, origin?: string | null) {
  return jsonResponse(
    { error: { message, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'ERROR' } },
    status,
    { 'X-Request-ID': requestId },
    origin
  );
}

export interface AgentContext {
  agentId: string;
  agentName: string;
  tenantId: string;
  hmacSecret: string | null;
  /** Extra agent fields fetched via extraAgentFields option */
  agentData: Record<string, unknown>;
  supabase: any;
  requestId: string;
  body: unknown;
  /** Raw body text (available when hmacVerify is true) */
  rawBody?: string;
  req: Request;
}

export type AgentHandler = (req: Request, ctx: AgentContext) => Promise<Response | Record<string, unknown> | unknown>;

export interface ServeAgentOptions {
  /** Additional columns to select from the agents table beyond the defaults */
  extraAgentFields?: string[];
  /** Enable HMAC verification before handler execution. Default: false */
  hmacVerify?: boolean;
  /** Optional rate limiting config */
  rateLimit?: RateLimitOption;
}

/**
 * Middleware for agent-authenticated endpoints.
 * Uses X-Agent-Token header + token_hash lookup.
 * Optionally verifies HMAC signature (hmacVerify: true).
 */
export function serveAgent(handler: AgentHandler, options?: ServeAgentOptions) {
  Deno.serve(async (req: Request) => {
    const startTime = Date.now();
    const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
    const requestId = traceId;
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    let currentAgentId: string | undefined;
    let currentTenantId: string | undefined;

    try {
      const supabase = createClient<any>(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      );

      // 1. JWT / Cross-Auth Protection
      // Agents MUST use X-Agent-Token or a custom Bearer token.
      // We block any request that uses a valid Supabase User JWT (auth.users)
      // to prevent "User-as-Agent" session hijacking.
      const authHeader = req.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ') && authHeader.split('.').length === 3) { // Proper JWT check (two dots)
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user && !error) {
          logger.error(`[serveAgent][${requestId}] Blocked User JWT from accessing agent route. User: ${user.id}`);
          return errorResponse('User JWT not allowed on agent endpoints', 403, requestId, origin);
        }
      }

      // Clone request BEFORE any body consumption (needed for HMAC verification)
      const reqClone = options?.hmacVerify ? req.clone() : req;

      // Import agent auth dynamically to avoid circular deps
      const { authenticateAgent } = await import('./agent-auth.ts');
      const authResult = await authenticateAgent(supabase, req, requestId, {
        extraAgentFields: options?.extraAgentFields,
      });
      
      if (!authResult.success) {
        return authResult.response;
      }

      const agent = authResult.agent;
      currentAgentId = agent.id;
      currentTenantId = agent.tenant_id;

      // === HONEYPOT GATE ===
      const honeypotMode: string | undefined = authResult.agentData.honeypot_mode as string | undefined;
      if (honeypotMode === 'flipped') {
        const { isKillSwitchEnabled } = await import('./feature-flags.ts');
        const honeypotEnabled = await isKillSwitchEnabled(supabase, 'HONEYPOT_ENABLED', agent.tenant_id);
        if (honeypotEnabled) {
          const { handleHoneypotAgentRequest } = await import('./honeypot/agent-handler.ts');
          const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

          let hpBody: unknown = {};
          if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            try { hpBody = await req.clone().json(); } catch { hpBody = {}; }
          }

          return handleHoneypotAgentRequest(req, {
            agentId: agent.id,
            agentName: agent.agent_name,
            tenantId: agent.tenant_id,
            requestId,
            body: hpBody,
            sourceIp,
          }, supabase);
        }
      }
      // === END HONEYPOT GATE ===

      // HMAC verification
      let rawBody: string | undefined;
      if (options?.hmacVerify) {
        if (!agent.hmac_secret) {
          logger.error(`[serveAgent][${requestId}] Agent ${agent.agent_name} missing HMAC secret`);
          return errorResponse('HMAC secret not configured for agent', 500, requestId, origin);
        }

        const { verifyHmacSignature } = await import('./hmac.ts');
        const hmacResult = await verifyHmacSignature(supabase, reqClone, agent.agent_name, agent.hmac_secret, {
          agentId: agent.id,
          tenantId: agent.tenant_id,
          endpoint: requestId,
        });

        if (!hmacResult.valid) {
          return jsonResponse(
            { error: 'unauthorized', code: hmacResult.errorCode, message: hmacResult.errorMessage, transient: hmacResult.transient },
            401,
            { 'X-Request-ID': requestId },
            origin,
          );
        }
        rawBody = hmacResult.rawBody;
      }

      // Rate limiting
      if (options?.rateLimit) {
        const { checkRateLimit } = await import('./rate-limit.ts');
        const rlResult = await checkRateLimit(supabase, agent.agent_name, options.rateLimit.endpoint, {
          maxRequests: options.rateLimit.maxRequests ?? 60,
          windowMinutes: options.rateLimit.windowMinutes ?? 1,
          blockMinutes: options.rateLimit.blockMinutes ?? 5,
        });
        if (!rlResult.allowed) {
          const retryAfter = rlResult.resetAt
            ? Math.max(1, Math.ceil((rlResult.resetAt.getTime() - Date.now()) / 1000))
            : 60;
          return jsonResponse(
            { error: { message: 'Rate limit exceeded', code: 'RATE_LIMITED' } },
            429,
            { 'X-Request-ID': requestId, 'Retry-After': String(retryAfter) },
            origin,
          );
        }
      }

      // Parse body
      let body: unknown = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          if (rawBody !== undefined) {
            body = rawBody.trim() ? JSON.parse(rawBody) : {};
          } else {
            const contentEncoding = req.headers.get('Content-Encoding');
            if (contentEncoding === 'gzip') {
              const compressed = await (options?.hmacVerify ? reqClone : req).arrayBuffer();
              const ds = new DecompressionStream('gzip');
              const decompressed = new Response(
                new Response(compressed).body?.pipeThrough(ds)
              );
              body = await decompressed.json();
            } else {
              body = await (options?.hmacVerify ? reqClone : req).json();
            }
          }
        } catch { body = {}; }
      }

      const ctx: AgentContext = {
        agentId: agent.id,
        agentName: agent.agent_name,
        tenantId: agent.tenant_id,
        hmacSecret: agent.hmac_secret,
        agentData: authResult.agentData,
        supabase,
        requestId,
        body,
        rawBody,
        req,
      };

      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId, 'X-Trace-ID': traceId }, origin);
    } catch (error) {
      return handleExceptionWithContext(error, requestId, 'serveAgent', startTime, {
        agentId: currentAgentId,
        tenantId: currentTenantId,
      });
    }
  });
}
