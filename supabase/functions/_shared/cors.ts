import { securityHeaders } from './security-headers.ts';

const ALLOWED_ORIGINS = [
  'https://cybshield.com.br',
  'https://www.cybshield.com.br',
  'https://cybershield.com.br',
  'https://www.cybershield.com.br',
  'https://cybershield-audit.lovable.app',
  'https://id-preview--affc1ab5-463f-41f7-ae33-f788e864f6ee.lovable.app',
];

/**
 * Check if an origin is allowed.
 * Accepts exact matches from the allowlist plus any *.lovable.app/project.com/dev subdomain.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9._-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9._-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9._-]+\.lovable\.dev$/.test(origin)) return true;
  if (typeof Deno !== 'undefined' && (Deno.env.get('ENV') === 'development' || Deno.env.get('ENVIRONMENT') === 'development') && origin.startsWith('http://localhost:')) return true;
  return false;
}

/**
 * Build CORS + security headers for a given request origin.
 */
export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  // FIX: If origin is from Lovable but not explicitly in allowlist, allow it without credentials
  // This prevents CORS breaks on error responses where origin detection might be slightly different.
  const allowedOrigin = allowed ? origin! : (origin && isAllowedOrigin(origin) ? origin : '*');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-hmac-timestamp, x-hmac-nonce, x-timestamp, x-nonce, x-request-id, x-trace-id, x-tenant-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Request-ID, X-Trace-ID, X-Response-Time',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    ...securityHeaders,
  };

  // Only use credentials if origin is specifically allowed (required by browsers for wildcard)
  if (allowed) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

/**
 * Static corsHeaders kept for backward compatibility.
 * Now defaults to '*' which is safer for error responses from unknown origins.
 */
export const corsHeaders = buildCorsHeaders(null);
