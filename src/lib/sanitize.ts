/**
 * Log sanitization utility
 * Redacts sensitive keys from objects before logging.
 * Prevents accidental exposure of tokens, passwords, and PII.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'api_key',
  'apikey',
  'apiKey',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'session_token',
  'sessionToken',
  'credit_card',
  'creditCard',
  'ssn',
  'cpf',
  'cnpj',
  'hmac',
  'hmac_secret',
  'private_key',
  'privateKey',
  'service_role',
  'serviceRole',
  'supabase_service_role_key',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

/**
 * Check if a key name suggests sensitive data
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const sensitive of SENSITIVE_KEYS) {
    if (lower.includes(sensitive.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitize an object by redacting sensitive keys recursively.
 * Safe for logging — returns a new object without mutating the original.
 */
export function sanitizeForLog(obj: unknown, depth: number = 0): unknown {
  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Redact strings that look like tokens (long base64/hex strings)
    if (obj.length > 40 && /^[A-Za-z0-9+/=_-]{40,}$/.test(obj)) {
      return `${obj.substring(0, 8)}...${REDACTED}`;
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => sanitizeForLog(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    const entries = Object.entries(obj as any);

    for (const [key, value] of entries.slice(0, 50)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeForLog(value, depth + 1);
      }
    }

    return sanitized;
  }

  return String(obj);
}

/**
 * Sanitize an error for safe logging
 */
export function sanitizeError(error: unknown): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: import.meta.env.DEV ? error.stack : undefined,
      code: 'code' in error ? (error as { code?: string }).code : undefined,
    };
  }
  return { raw: String(error) };
}
