/**
 * servePublic() — Middleware for webhooks and unauthenticated endpoints.
 * Extracted from serve-tenant.ts for modularity.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import { loggerWithContext } from './logger.ts';
import { handleExceptionWithContext } from './error-handler.ts';

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>, origin?: string | null) {
  const cors = origin ? buildCorsHeaders(origin) : { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
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

export interface PublicContext {
  supabase: any;
  requestId: string;
  body: unknown;
  /** Raw body as text (if requested) */
  rawBody?: string;
}

export type PublicHandler = (req: Request, ctx: PublicContext) => Promise<Response | Record<string, unknown> | unknown>;

export interface ServePublicOptions {
  /** If true, reads request body as text and provides it in ctx.rawBody. Default: false */
  provideRawBody?: boolean;
  /** Optional rate limiting config */
  rateLimit?: {
    endpoint: string;
    maxRequests?: number;
    windowMinutes?: number;
    blockMinutes?: number;
  };
}

export function servePublic(handler: PublicHandler, options?: ServePublicOptions) {
  Deno.serve(async (req: Request) => {
    const startTime = Date.now();
    const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
    const requestId = traceId;
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    try {
      const supabase = createClient<any>(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      );

      // Rate limiting (optional)
      if (options?.rateLimit) {
        const { checkRateLimit } = await import('./rate-limit.ts');
        const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rlResult = await checkRateLimit(supabase, `ip:${sourceIp}`, options.rateLimit.endpoint, {
          maxRequests: options.rateLimit.maxRequests ?? 100,
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

      let body: unknown = {};
      let rawBody: string | undefined;

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (options?.provideRawBody) {
          rawBody = await req.text();
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = {};
          }
        } else {
          try {
            body = await req.json();
          } catch {
            body = {};
          }
        }
      }

      const result = await handler(req, { supabase, requestId, body, rawBody });
      
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { 'X-Request-ID': requestId, 'X-Trace-ID': traceId }, origin);
    } catch (error) {
      return handleExceptionWithContext(error, requestId, 'servePublic', startTime);
    }
  });
}
