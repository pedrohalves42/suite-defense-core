/**
 * serveTenant() ? Centralized Edge Function middleware for tenant validation.
 * 
 * Replaces raw Deno.serve() to enforce tenant isolation on ALL user-facing functions.
 * 
 * Features:
 * - CORS handling (OPTIONS)
 * - JWT validation via getClaims()
 * - tenant_id extraction from body, header, or query
 * - Caller-tenant authorization via user_roles
 * - Internal call bypass (service_role / X-Internal-Secret)
 * - Agent auth bypass (X-Agent-Token ? handled separately)
 * - Request context (X-Request-ID, timing)
 * 
 * Usage:
 *   import { serveTenant } from '../_shared/serve-tenant.ts';
 *   
 *   serveTenant(async (req, ctx) => {
 *     // ctx.tenantId is guaranteed valid
 *     // ctx.userId is set for user calls
 *     // ctx.isInternal is true for service_role/internal calls
 *     const { data } = await ctx.supabase
 *       .from('my_table')
 *       .select('*')
 *       .eq('tenant_id', ctx.tenantId);
 *     return { data };
 *   });
 * 
 * For agent-authenticated endpoints, use serveAgent() instead.
 * For public endpoints (webhooks), use servePublic().
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import { logger, loggerWithContext } from './logger.ts';
import { timingSafeEqual } from './crypto-utils.ts';

// ??? Types ???????????????????????????????????????????????????????????????????

export interface TenantContext<T = unknown> {
  /** Validated tenant ID ? guaranteed to be authorized */
  tenantId: string;
  /** User ID from JWT (null for internal/service calls) */
  userId: string | null;
  /** True if call came via service_role or X-Internal-Secret */
  isInternal: boolean;
  /** Supabase client with service_role (for server-side operations) */
  supabase: SupabaseClient;
  /** Request ID for tracing */
  requestId: string;
  /** Parsed request body (typed via generic, defaults to unknown) */
  body: T;
  /** Original request */
  req: Request;
}

export interface RateLimitOption {
  /** Endpoint key for rate limit lookup (e.g. 'create-job') */
  endpoint: string;
  /** Max requests per window. Default: 60 */
  maxRequests?: number;
  /** Window in minutes. Default: 1 */
  windowMinutes?: number;
  /** Block duration in minutes when exceeded. Default: 5 */
  blockMinutes?: number;
}

export interface ServeOptions {
  /** 
   * How to extract tenant_id. Default: 'auto' 
   * - 'body': from JSON body field `tenant_id`
   * - 'header': from `x-tenant-id` header
   * - 'auto': tries body first, then header, then user's default tenant
   */
  tenantSource?: 'body' | 'header' | 'auto';
  
  /** 
   * Allow requests without a tenant_id (resolves from user's default tenant).
   * Default: true 
   */
  allowFallback?: boolean;

  /**
   * HTTP methods to allow. Default: ['POST']
   * GET requests won't have a body, so tenant comes from header/query.
   */
  methods?: string[];

  /**
   * Skip tenant validation entirely (for system-wide endpoints).
   * Use with extreme caution ? prefer servePublic() for webhooks.
   * Default: false
   */
  skipTenantValidation?: boolean;

  /**
   * Optional rate limiting. When set, requests are checked against
   * the check_rate_limit_atomic RPC before processing.
   */
  rateLimit?: RateLimitOption;
}

type TenantHandler<T = unknown> = (req: Request, ctx: TenantContext<T>) => Promise<Response | Record<string, unknown> | unknown>;

// ??? Helpers ?????????????????????????????????????????????????????????????????

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>, origin?: string | null) {
  const cors = origin ? buildCorsHeaders(origin) : corsHeaders;
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

async function resolveDefaultTenant(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id || null;
}

async function verifyUserTenantAccess(supabase: SupabaseClient, userId: string, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ??? Main Middleware ?????????????????????????????????????????????????????????

export function serveTenant<T = unknown>(handler: TenantHandler<T>, options?: ServeOptions) {
  const {
    tenantSource = 'auto',
    allowFallback = true,
    methods = ['POST'],
    skipTenantValidation = false,
    rateLimit: rateLimitConfig,
  } = options || {};

  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();
    const startTime = Date.now();
    const origin = req.headers.get('origin');

    // 1. CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    // 2. Method check
    if (methods.length > 0 && !methods.includes(req.method)) {
      return errorResponse(`Method ${req.method} not allowed`, 405, requestId, origin);
    }

    try {
      const supabaseUrl = requireEnv('SUPABASE_URL');
      const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const authHeader = req.headers.get('Authorization');
      const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
      const expectedInternalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');

      // 3. Parse body (only for methods that have body)
      let body: unknown = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          body = await req.json();
        } catch {
          body = {};
        }
      }

      // 4. Determine auth type
      let isInternal = false;
      let userId: string | null = null;

      // 4a. Internal call via X-Internal-Secret (timing-safe)
      if (internalSecret && expectedInternalSecret && await timingSafeEqual(internalSecret, expectedInternalSecret)) {
        isInternal = true;
      }
      // 4b. Service role key in Authorization (timing-safe)
      else if (authHeader && serviceRoleKey && await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`)) {
        isInternal = true;
      }
      // 4c. Standard JWT auth
      else if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        // V-11003 FIX: Use getUser() instead of getClaims() which doesn't exist in supabase-js v2
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !authUser) {
        logger.warn(`[serveTenant][${requestId}] Invalid JWT`);
          return errorResponse('Invalid or expired token', 401, requestId, origin);
        }
        userId = authUser.id;
      }
      // 4d. No auth at all
      else {
        return errorResponse('Authorization required', 401, requestId, origin);
      }

      // 5. Resolve tenant_id
      let tenantId: string | null = null;

      if (tenantSource === 'body' || tenantSource === 'auto') {
        const bodyObj = body as Record<string, unknown> | null;
        tenantId = (bodyObj?.tenant_id as string) || null;
      }
      if (!tenantId && (tenantSource === 'header' || tenantSource === 'auto')) {
        tenantId = req.headers.get('x-tenant-id') || null;
      }

      // 6. Validate tenant access
      if (!skipTenantValidation) {
        if (isInternal) {
          // Internal calls: trust the provided tenant_id
          if (!tenantId) {
            return errorResponse('tenant_id required for internal calls', 400, requestId, origin);
          }
        } else if (userId) {
          // User calls: validate access
          if (tenantId) {
            const hasAccess = await verifyUserTenantAccess(supabase, userId, tenantId);
            if (!hasAccess) {
              logger.warn(`[SECURITY][${requestId}] User ${userId} denied access to tenant ${tenantId}`);
              return errorResponse('Access denied: unauthorized tenant', 403, requestId, origin);
            }
          } else if (allowFallback) {
            tenantId = await resolveDefaultTenant(supabase, userId);
            if (!tenantId) {
              return errorResponse('No tenant associated with user', 403, requestId, origin);
            }
          } else {
            return errorResponse('tenant_id required', 400, requestId, origin);
          }
        }
      } else {
        // V-11004 FIX: When skipTenantValidation is true and no tenantId,
        // set a safe default instead of passing null as non-null assertion
        if (!tenantId) {
          logger.warn(`[serveTenant][${requestId}] skipTenantValidation=true but no tenant_id provided`);
        }
      }

      // 7. Rate limiting (optional)
      if (rateLimitConfig && tenantId) {
        const { checkRateLimit } = await import('./rate-limit.ts');
        const identifier = userId ? `user:${userId}` : `tenant:${tenantId}`;
        const rlResult = await checkRateLimit(supabase, identifier, rateLimitConfig.endpoint, {
          maxRequests: rateLimitConfig.maxRequests ?? 60,
          windowMinutes: rateLimitConfig.windowMinutes ?? 1,
          blockMinutes: rateLimitConfig.blockMinutes ?? 5,
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

      // 8. Build context and call handler
      const ctx: TenantContext<T> = {
        tenantId: tenantId!,
        userId,
        isInternal,
        supabase,
        requestId,
        body: body as T,
        req,
      };

      const result = await handler(req, ctx);

      // 8. Return response
      const responseTime = `${Date.now() - startTime}ms`;
      
      if (result instanceof Response) {
        // Handler returned a raw Response ? pass through
        return result;
      }

      return jsonResponse(result, 200, {
        'X-Request-ID': requestId,
        'X-Response-Time': responseTime,
      }, origin);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      const log = loggerWithContext({ requestId, tenantId: tenantId ?? undefined });
      log.error(`[serveTenant] Error`, { message: msg });
      return errorResponse(msg, 500, requestId, origin);
    }
  });
}

// ??? servePublic: For webhooks and unauthenticated endpoints ?????????????????

export type PublicHandler = (req: Request, ctx: { supabase: SupabaseClient; requestId: string; body: unknown }) => Promise<Response | Record<string, unknown> | unknown>;

export function servePublic(handler: PublicHandler) {
  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    try {
      const supabase = createClient(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      );

      let body: unknown = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try { body = await req.json(); } catch { body = {}; }
      }

      const result = await handler(req, { supabase, requestId, body });
      
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId }, origin);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      const log = loggerWithContext({ requestId });
      log.error(`[servePublic] Error`, { message: msg });
      return errorResponse(msg, 500, requestId, origin);
    }
  });
}

// ??? serveAgent: For agent-authenticated endpoints ??????????????????????????

export interface AgentContext {
  agentId: string;
  agentName: string;
  tenantId: string;
  hmacSecret: string | null;
  /** Extra agent fields fetched via extraAgentFields option */
  agentData: Record<string, unknown>;
  supabase: SupabaseClient;
  requestId: string;
  body: unknown;
  req: Request;
}

export type AgentHandler = (req: Request, ctx: AgentContext) => Promise<Response | Record<string, unknown> | unknown>;

export interface ServeAgentOptions {
  /** Additional columns to select from the agents table beyond the defaults */
  extraAgentFields?: string[];
}

/**
 * Middleware for agent-authenticated endpoints.
 * Uses X-Agent-Token header + token_hash lookup.
 * 
 * @param options.extraAgentFields - Additional agent columns to fetch (e.g. ['status', 'agent_version', 'force_update_version'])
 */
export function serveAgent(handler: AgentHandler, options?: ServeAgentOptions) {
  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    try {
      const supabase = createClient(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      );

      // Import agent auth dynamically to avoid circular deps
      const { authenticateAgent } = await import('./agent-auth.ts');
      const authResult = await authenticateAgent(supabase, req, requestId, {
        extraAgentFields: options?.extraAgentFields,
      });
      
      if (!authResult.success) {
        return authResult.response;
      }

      let body: unknown = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          const contentEncoding = req.headers.get('Content-Encoding');
          if (contentEncoding === 'gzip') {
            // COST-OPT v10: Decompress gzip payloads from agents (~30% bandwidth savings)
            const compressed = await req.arrayBuffer();
            const ds = new DecompressionStream('gzip');
            const decompressed = new Response(
              new Blob([compressed]).stream().pipeThrough(ds)
            );
            body = await decompressed.json();
          } else {
            body = await req.json();
          }
        } catch { body = {}; }
      }

      const ctx: AgentContext = {
        agentId: authResult.agent.id,
        agentName: authResult.agent.agent_name,
        tenantId: authResult.agent.tenant_id,
        hmacSecret: authResult.agent.hmac_secret,
        agentData: authResult.agentData,
        supabase,
        requestId,
        body,
        req,
      };

      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId }, origin);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      const log = loggerWithContext({ requestId });
      log.error(`[serveAgent] Error`, { message: msg });
      return errorResponse(msg, 500, requestId, origin);
    }
  });
}

// ═══ serveInternal: For cron/orchestration endpoints (service_role or X-Internal-Secret) ═══

export interface InternalContext {
  supabase: SupabaseClient;
  requestId: string;
  body: unknown;
}

export type InternalHandler = (req: Request, ctx: InternalContext) => Promise<Response | Record<string, unknown> | unknown>;

/**
 * Middleware for internal/cron endpoints.
 * Validates caller via service_role JWT or X-Internal-Secret header.
 * No tenant validation — these are system-wide operations.
 */
export function serveInternal(handler: InternalHandler) {
  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();
    const origin = req.headers.get('origin');
    const log = loggerWithContext({ requestId });

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    try {
      const supabase = createClient(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      );

      // Validate caller is internal (service_role or X-Internal-Secret)
      const { assertInternalCaller } = await import('./assert-internal-caller.ts');
      const authError = await assertInternalCaller(req);
      if (authError) return authError;

      let body: unknown = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try { body = await req.json(); } catch { body = {}; }
      }

      const result = await handler(req, { supabase, requestId, body });
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId }, origin);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      log.error(`[serveInternal] Error`, { message: msg });
      return errorResponse(msg, 500, requestId, origin);
    }
  });
}
