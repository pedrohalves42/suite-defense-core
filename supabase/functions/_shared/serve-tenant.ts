/**
 * serveTenant() → Centralized Edge Function middleware for tenant validation.
 * 
 * servePublic, serveAgent, serveInternal are now in dedicated files
 * but re-exported here for backward compatibility.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import { logger, loggerWithContext } from './logger.ts';
import { timingSafeEqual } from './crypto-utils.ts';

// Re-export extracted middlewares for backward compatibility
export { servePublic } from './serve-public.ts';
export type { PublicHandler } from './serve-public.ts';
export { serveAgent } from './serve-agent.ts';
export type { AgentContext, AgentHandler, ServeAgentOptions } from './serve-agent.ts';
export { serveInternal } from './serve-internal.ts';
export type { InternalContext, InternalHandler } from './serve-internal.ts';

// ═══ Types ═══════════════════════════════════════════════════════════════════

export interface TenantContext<T = unknown> {
  /** Validated tenant ID → guaranteed to be authorized */
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
  tenantSource?: 'body' | 'header' | 'auto';
  allowFallback?: boolean;
  methods?: string[];
  skipTenantValidation?: boolean;
  rateLimit?: RateLimitOption;
}

type TenantHandler<T = unknown> = (req: Request, ctx: TenantContext<T>) => Promise<Response | Record<string, unknown> | unknown>;

// ═══ Helpers ═════════════════════════════════════════════════════════════════

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

// ═══ Main Middleware ═════════════════════════════════════════════════════════

export function serveTenant<T = unknown>(handler: TenantHandler<T>, options?: ServeOptions) {
  const {
    tenantSource = 'auto',
    allowFallback = true,
    methods = ['POST'],
    skipTenantValidation = false,
    rateLimit: rateLimitConfig,
  } = options || {};

  Deno.serve(async (req: Request) => {
    const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
    const requestId = traceId;
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
          if (!tenantId) {
            return errorResponse('tenant_id required for internal calls', 400, requestId, origin);
          }
        } else if (userId) {
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

      const responseTime = `${Date.now() - startTime}ms`;
      
      if (result instanceof Response) {
        return result;
      }

      return jsonResponse(result, 200, {
        'X-Request-ID': requestId,
        'X-Trace-ID': traceId,
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
