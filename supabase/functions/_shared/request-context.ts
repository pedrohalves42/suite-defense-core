/**
 * Request Context utility for X-Request-ID / X-Trace-ID correlation
 * Enables end-to-end tracing from agent → edge function → database
 */

export interface RequestContext {
  requestId: string;
  /** Trace ID propagated from agent (X-Trace-ID) — same as requestId if agent didn't send one */
  traceId: string;
  startTime: number;
  endpoint: string;
}

/**
 * Creates a request context with X-Request-ID and X-Trace-ID.
 * Agent-originated traceId is preserved for end-to-end correlation.
 */
export function createRequestContext(req: Request, endpoint: string): RequestContext {
  const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
  return {
    requestId: traceId,
    traceId,
    startTime: Date.now(),
    endpoint,
  };
}

/**
 * Generates response headers including X-Request-ID, X-Trace-ID and X-Response-Time
 */
export function getResponseHeaders(ctx: RequestContext): Record<string, string> {
  return {
    'X-Request-ID': ctx.requestId,
    'X-Trace-ID': ctx.traceId,
    'X-Response-Time': `${Date.now() - ctx.startTime}ms`,
  };
}

/**
 * Merges CORS headers with request context headers
 */
export function mergeHeaders(
  corsHeaders: Record<string, string>,
  ctx: RequestContext
): Record<string, string> {
  return {
    ...corsHeaders,
    ...getResponseHeaders(ctx),
  };
}
