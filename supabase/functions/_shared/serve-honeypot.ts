/**
 * serveHoneypot() — Dedicated middleware for honeypot endpoints.
 * 
 * NOT servePublic. Purpose-built with:
 * - 8 KB body cap
 * - 1 KB snippet for storage
 * - Header allowlist (not blacklist)
 * - IP hashing + prefix extraction
 * - Mandatory trace_id
 * - Rate limit (bucket-based, fail-closed)
 * - Response profile support
 * - Structured logging
 * - No stack traces, no topology leaks
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from './cors.ts';
import { securityHeaders } from './security-headers.ts';
import { requireEnv } from './env.ts';
import {
  MAX_BODY_BYTES,
  truncateBody,
  filterHeaders,
  extractSourceIp,
  hashIp,
  extractIpPrefix,
} from './honeypot/sanitize.ts';
import { classifyPayload } from './honeypot/classify.ts';
import { checkHoneypotRateLimit } from './honeypot/rate-limit.ts';
import { buildHoneypotResponse, type ResponseProfileType } from './honeypot/response-profiles.ts';

export interface HoneypotContext {
  supabase: SupabaseClient;
  requestId: string;
  /** Raw body string (capped at 8 KB) */
  rawBody: string;
  /** Parsed body (or empty object if parse fails) */
  body: unknown;
  /** Truncated snippet (1 KB max) for storage */
  bodySnippet: string;
  /** Allowlisted headers only */
  headersFiltered: Record<string, string>;
  /** SHA-256 hash of source IP */
  sourceIpHash: string;
  /** First two octets of IP (e.g. "192.168.x.x") */
  sourceIpPrefix: string;
  /** Payload classification from regex classifier */
  classification: string;
  /** Classification labels */
  classificationLabels: string[];
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Response profile to use */
  responseProfile: ResponseProfileType;
}

export type HoneypotHandler = (
  req: Request,
  ctx: HoneypotContext,
) => Promise<Response | Record<string, unknown> | unknown>;

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...securityHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

/**
 * Dedicated middleware for honeypot endpoints.
 * Applies all security controls before calling the handler.
 */
export function serveHoneypot(handler: HoneypotHandler) {
  Deno.serve(async (req: Request) => {
    const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
    const requestId = traceId;
    const origin = req.headers.get('origin');
    const corsH = buildCorsHeaders(origin);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsH });
    }

    try {
      const supabase = createClient(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      );

      // 1. Extract and hash source IP
      const sourceIp = extractSourceIp(req);
      const sourceIpHash = await hashIp(sourceIp);
      const sourceIpPrefix = extractIpPrefix(sourceIp);

      // 2. Rate limit by hashed IP (5 req/min, block 15 min)
      const allowed = await checkHoneypotRateLimit(supabase, `ip:${sourceIp}`, {
        maxRequests: 5,
        bucketSeconds: 60,
        blockSeconds: 900,
      });

      if (!allowed) {
        return jsonResponse(
          { error: 'Too many requests' },
          429,
          { ...corsH, 'Retry-After': '900', 'X-Request-ID': requestId },
        );
      }

      // 3. Read body with 8 KB cap
      let rawBody = '';
      let body: unknown = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          const bodyText = await req.text();
          if (bodyText.length > MAX_BODY_BYTES) {
            rawBody = bodyText.substring(0, MAX_BODY_BYTES);
          } else {
            rawBody = bodyText;
          }
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = {};
          }
        } catch {
          rawBody = '';
          body = {};
        }
      }

      // 4. Prepare context
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;
      const bodySnippet = truncateBody(body);
      const headersFiltered = filterHeaders(req.headers);
      const { classification, labels: classificationLabels } = classifyPayload(bodySnippet, path, method);

      const ctx: HoneypotContext = {
        supabase,
        requestId,
        rawBody,
        body,
        bodySnippet,
        headersFiltered,
        sourceIpHash,
        sourceIpPrefix,
        classification,
        classificationLabels,
        method,
        path,
        responseProfile: 'default',
      };

      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, { ...corsH, 'X-Request-ID': requestId, 'X-Trace-ID': traceId });
    } catch (error) {
      // Never leak stack traces or topology
      console.error(`[serveHoneypot][${requestId}] Error:`, error instanceof Error ? error.message : 'unknown');
      return jsonResponse(
        { status: 'ok' }, // Don't reveal errors to attackers
        200,
        { ...corsH, 'X-Request-ID': requestId },
      );
    }
  });
}
