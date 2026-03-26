/**
 * Log sanitization for Edge Functions (Deno)
 * Mirrors src/lib/sanitize.ts but works in Deno runtime.
 */

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'key', 'authorization',
  'api_key', 'apikey', 'access_token', 'refresh_token',
  'session_token', 'credit_card', 'ssn', 'cpf', 'cnpj',
  'hmac', 'hmac_secret', 'private_key', 'service_role',
]);

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const sensitive of SENSITIVE_KEYS) {
    if (lower.includes(sensitive)) return true;
  }
  return false;
}

export function sanitizeForLog(obj: unknown, depth: number = 0): unknown {
  if (depth > 8) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.length > 40 && /^[A-Za-z0-9+/=_-]{40,}$/.test(obj)) {
      return `${obj.substring(0, 8)}...${REDACTED}`;
    }
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 100).map(item => sanitizeForLog(item, depth + 1));
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>).slice(0, 50)) {
      sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeForLog(value, depth + 1);
    }
    return sanitized;
  }
  return String(obj);
}
