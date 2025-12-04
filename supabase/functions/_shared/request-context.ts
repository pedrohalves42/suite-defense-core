/**
 * Request Context utility for X-Request-ID correlation
 * Enables tracing requests across Edge Functions
 */

export interface RequestContext {
  requestId: string;
  startTime: number;
  endpoint: string;
}

/**
 * Creates a request context with X-Request-ID
 * If client provides X-Request-ID, it's reused; otherwise generates new UUID
 */
export function createRequestContext(req: Request, endpoint: string): RequestContext {
  const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();
  return {
    requestId,
    startTime: Date.now(),
    endpoint,
  };
}

/**
 * Generates response headers including X-Request-ID and X-Response-Time
 */
export function getResponseHeaders(ctx: RequestContext): Record<string, string> {
  return {
    'X-Request-ID': ctx.requestId,
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
