/**
 * servePublic() — Middleware for webhooks and unauthenticated endpoints.
 * Extracted from serve-tenant.ts for modularity.
 */
import { createSupabaseClient } from './supabase-client.ts';
import { buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import { loggerWithContext } from './logger.ts';
import { handleExceptionWithContext, createErrorResponse, ErrorCode } from './error-handler.ts';
import { composePipeline } from './reliability/pipeline.ts';

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>, origin?: string | null) {
  const cors = buildCorsHeaders(origin ?? null);
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, ...securityHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function errorResponse(message: string, status: number, requestId: string) {
  const code = status === 429 ? 'RATE_LIMITED' : status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.BAD_REQUEST;
  return createErrorResponse(code, message, status, requestId);
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
    const origin = req.headers.get('Origin') || req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    try {
      const supabase = createSupabaseClient(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      );

      // Rate limiting (optional)
      if (options?.rateLimit) {
        try {
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
        } catch (rlError) {
          loggerWithContext(requestId).warn('Rate limiting failed to initialize, skipping check', rlError);
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

      // R4 Wave 1: identity pipeline (no stages active besides business).
      const businessFn = async (r: Request): Promise<Response> => {
        const result = await handler(r, { supabase, requestId, body, rawBody });
        if (result instanceof Response) return result;
        return jsonResponse(result, 200, { 'X-Request-ID': requestId, 'X-Trace-ID': traceId }, origin);
      };
      return await composePipeline({ business: businessFn })(req);
    } catch (error) {
      return handleExceptionWithContext(error, requestId, 'servePublic', startTime);
    }
  });
}
