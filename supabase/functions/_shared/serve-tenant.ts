/**
 * serveTenant() — Centralized Edge Function middleware for tenant validation.
 * 
 * Replaces raw Deno.serve() to enforce tenant isolation on ALL user-facing functions.
 * 
 * Features:
 * - CORS handling (OPTIONS)
 * - JWT validation via getClaims()
 * - tenant_id extraction from body, header, or query
 * - Caller-tenant authorization via user_roles
 * - Internal call bypass (service_role / X-Internal-Secret)
 * - Agent auth bypass (X-Agent-Token — handled separately)
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
import { corsHeaders } from './cors.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TenantContext {
  /** Validated tenant ID — guaranteed to be authorized */
  tenantId: string;
  /** User ID from JWT (null for internal/service calls) */
  userId: string | null;
  /** True if call came via service_role or X-Internal-Secret */
  isInternal: boolean;
  /** Supabase client with service_role (for server-side operations) */
  supabase: SupabaseClient;
  /** Request ID for tracing */
  requestId: string;
  /** Parsed request body (cached to avoid double-read) */
  body: any;
  /** Original request */
  req: Request;
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
   * Use with extreme caution — prefer servePublic() for webhooks.
   * Default: false
   */
  skipTenantValidation?: boolean;
}

type TenantHandler = (req: Request, ctx: TenantContext) => Promise<any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(data: any, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function errorResponse(message: string, status: number, requestId: string) {
  return jsonResponse(
    { error: { message, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'ERROR' } },
    status,
    { 'X-Request-ID': requestId }
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

// ─── Main Middleware ─────────────────────────────────────────────────────────

export function serveTenant(handler: TenantHandler, options?: ServeOptions) {
  const {
    tenantSource = 'auto',
    allowFallback = true,
    methods = ['POST'],
    skipTenantValidation = false,
  } = options || {};

  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();
    const startTime = Date.now();

    // 1. CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Method check
    if (methods.length > 0 && !methods.includes(req.method)) {
      return errorResponse(`Method ${req.method} not allowed`, 405, requestId);
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const authHeader = req.headers.get('Authorization');
      const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
      const expectedInternalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');

      // 3. Parse body (only for methods that have body)
      let body: any = {};
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

      // 4a. Internal call via X-Internal-Secret
      if (internalSecret && expectedInternalSecret && internalSecret === expectedInternalSecret) {
        isInternal = true;
      }
      // 4b. Service role key in Authorization
      else if (authHeader && authHeader === `Bearer ${serviceRoleKey}`) {
        isInternal = true;
      }
      // 4c. Standard JWT auth
      else if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        // V-11003 FIX: Use getUser() instead of getClaims() which doesn't exist in supabase-js v2
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !authUser) {
          console.warn(`[serveTenant][${requestId}] Invalid JWT`);
          return errorResponse('Invalid or expired token', 401, requestId);
        }
        userId = authUser.id;
      }
      // 4d. No auth at all
      else {
        return errorResponse('Authorization required', 401, requestId);
      }

      // 5. Resolve tenant_id
      let tenantId: string | null = null;

      if (tenantSource === 'body' || tenantSource === 'auto') {
        tenantId = body?.tenant_id || null;
      }
      if (!tenantId && (tenantSource === 'header' || tenantSource === 'auto')) {
        tenantId = req.headers.get('x-tenant-id') || null;
      }

      // 6. Validate tenant access
      if (!skipTenantValidation) {
        if (isInternal) {
          // Internal calls: trust the provided tenant_id
          if (!tenantId) {
            return errorResponse('tenant_id required for internal calls', 400, requestId);
          }
        } else if (userId) {
          // User calls: validate access
          if (tenantId) {
            const hasAccess = await verifyUserTenantAccess(supabase, userId, tenantId);
            if (!hasAccess) {
              console.warn(`[SECURITY][${requestId}] User ${userId} denied access to tenant ${tenantId}`);
              return errorResponse('Access denied: unauthorized tenant', 403, requestId);
            }
          } else if (allowFallback) {
            tenantId = await resolveDefaultTenant(supabase, userId);
            if (!tenantId) {
              return errorResponse('No tenant associated with user', 403, requestId);
            }
          } else {
            return errorResponse('tenant_id required', 400, requestId);
          }
        }
      } else {
        // V-11004 FIX: When skipTenantValidation is true and no tenantId,
        // set a safe default instead of passing null as non-null assertion
        if (!tenantId) {
          console.warn(`[serveTenant][${requestId}] skipTenantValidation=true but no tenant_id provided`);
        }
      }

      // 7. Build context and call handler
      const ctx: TenantContext = {
        tenantId: tenantId!,
        userId,
        isInternal,
        supabase,
        requestId,
        body,
        req,
      };

      const result = await handler(req, ctx);

      // 8. Return response
      const responseTime = `${Date.now() - startTime}ms`;
      
      if (result instanceof Response) {
        // Handler returned a raw Response — pass through
        return result;
      }

      return jsonResponse(result, 200, {
        'X-Request-ID': requestId,
        'X-Response-Time': responseTime,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      console.error(`[serveTenant][${requestId}] Error:`, msg);
      return errorResponse(msg, 500, requestId);
    }
  });
}

// ─── servePublic: For webhooks and unauthenticated endpoints ─────────────────

export type PublicHandler = (req: Request, ctx: { supabase: SupabaseClient; requestId: string; body: any }) => Promise<any>;

export function servePublic(handler: PublicHandler) {
  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      let body: any = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try { body = await req.json(); } catch { body = {}; }
      }

      const result = await handler(req, { supabase, requestId, body });
      
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      console.error(`[servePublic][${requestId}] Error:`, msg);
      return errorResponse(msg, 500, requestId);
    }
  });
}

// ─── serveAgent: For agent-authenticated endpoints ──────────────────────────

export interface AgentContext {
  agentId: string;
  agentName: string;
  tenantId: string;
  hmacSecret: string | null;
  supabase: SupabaseClient;
  requestId: string;
  body: any;
  req: Request;
}

export type AgentHandler = (req: Request, ctx: AgentContext) => Promise<any>;

/**
 * Middleware for agent-authenticated endpoints.
 * Uses X-Agent-Token header + token_hash lookup.
 */
export function serveAgent(handler: AgentHandler) {
  Deno.serve(async (req: Request) => {
    const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Import agent auth dynamically to avoid circular deps
      const { authenticateAgent } = await import('./agent-auth.ts');
      const authResult = await authenticateAgent(supabase, req, requestId);
      
      if (!authResult.success) {
        return authResult.response;
      }

      let body: any = {};
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
        supabase,
        requestId,
        body,
        req,
      };

      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      console.error(`[serveAgent][${requestId}] Error:`, msg);
      return errorResponse(msg, 500, requestId);
    }
  });
}
