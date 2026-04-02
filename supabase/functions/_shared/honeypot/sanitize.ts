/**
 * Honeypot-specific sanitization helpers.
 * Truncates body, filters sensitive headers, prevents PII leakage.
 */

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-agent-token',
  'x-hmac-signature',
  'x-hmac-secret',
  'x-internal-secret',
  'set-cookie',
]);

const MAX_BODY_SNIPPET = 500;

/**
 * Truncate body to safe storage size.
 */
export function truncateBody(body: unknown): string {
  if (body === null || body === undefined) return '';

  let str: string;
  if (typeof body === 'string') {
    str = body;
  } else {
    try {
      str = JSON.stringify(body);
    } catch {
      str = String(body);
    }
  }

  if (str.length > MAX_BODY_SNIPPET) {
    return str.substring(0, MAX_BODY_SNIPPET) + '...[truncated]';
  }
  return str;
}

/**
 * Filter headers, removing sensitive ones.
 * Returns a safe JSONB-ready object.
 */
export function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lower)) {
      filtered[lower] = '[REDACTED]';
    } else {
      // Truncate long header values
      filtered[lower] = value.length > 200 ? value.substring(0, 200) + '...' : value;
    }
  });
  return filtered;
}

/**
 * Extract source IP from request headers.
 */
export function extractSourceIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
