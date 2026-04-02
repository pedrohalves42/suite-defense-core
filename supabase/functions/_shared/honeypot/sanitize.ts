/**
 * Honeypot-specific sanitization helpers.
 * 
 * Security controls:
 * - Body cap: 8 KB max input, 1 KB persisted snippet
 * - Headers: allowlist only (not blacklist)
 * - IP: stored as SHA-256 hash + prefix (first octet group)
 * - No raw tokens, secrets, or PII persisted
 */

/** Max raw body size accepted (8 KB) */
export const MAX_BODY_BYTES = 8 * 1024;

/** Max snippet persisted to DB (1 KB) */
const MAX_SNIPPET_BYTES = 1024;

/** Headers allowed for persistence — everything else is dropped */
const ALLOWED_HEADERS = new Set([
  'user-agent',
  'content-type',
  'accept',
  'x-forwarded-for',
  'x-request-id',
  'x-trace-id',
  'content-length',
  'accept-encoding',
  'accept-language',
]);

/**
 * Truncate body to 1 KB snippet for storage.
 */
export function truncateBody(body: unknown, maxBytes: number = MAX_SNIPPET_BYTES): string {
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

  if (str.length > maxBytes) {
    return str.substring(0, maxBytes) + '...[truncated]';
  }
  return str;
}

/**
 * Filter headers by allowlist only.
 * Only persist headers from the allowed set. Everything else is dropped.
 */
export function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of ALLOWED_HEADERS) {
    const value = headers.get(key);
    if (value) {
      // Truncate long values
      filtered[key] = value.length > 200 ? value.substring(0, 200) + '...' : value;
    }
  }
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

/**
 * Hash an IP address using SHA-256 for privacy-safe storage.
 */
export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract IP prefix for grouping (first two octets for IPv4, first segment for IPv6).
 */
export function extractIpPrefix(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';

  // IPv4: take first two octets
  const ipv4Match = ip.match(/^(\d+\.\d+)\./);
  if (ipv4Match) return ipv4Match[1] + '.x.x';

  // IPv6: take first segment
  const ipv6Match = ip.match(/^([0-9a-fA-F]+):/);
  if (ipv6Match) return ipv6Match[1] + ':x';

  return 'unknown';
}
