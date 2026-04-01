/**
 * servePublic() — Middleware for webhooks and unauthenticated endpoints.
 * Extracted from serve-tenant.ts for modularity.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import { loggerWithContext } from './logger.ts';

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

export type PublicHandler = (req: Request, ctx: { supabase: SupabaseClient; requestId: string; body: unknown }) => Promise<Response | Record<string, unknown> | unknown>;

export function servePublic(handler: PublicHandler) {
  Deno.serve(async (req: Request) => {
    const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
    const requestId = traceId;
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
      return jsonResponse(result, 200, { 'X-Request-ID': requestId, 'X-Trace-ID': traceId }, origin);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      const log = loggerWithContext({ requestId });
      log.error(`[servePublic] Error`, { message: msg });
      return errorResponse(msg, 500, requestId, origin);
    }
  });
}
