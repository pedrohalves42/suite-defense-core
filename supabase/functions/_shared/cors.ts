import { securityHeaders } from './security-headers.ts';

const ALLOWED_ORIGINS = [
  'https://cybershield.com.br',
  'https://www.cybershield.com.br',
  'https://cybershield-audit.lovable.app',
  'https://id-preview--affc1ab5-463f-41f7-ae33-f788e864f6ee.lovable.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

/**
 * Build CORS + security headers for a given request origin.
 * Falls back to the primary production domain if the origin is not allowlisted.
 */
export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin))
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce, x-request-id, x-tenant-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Request-ID, X-Response-Time',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    ...securityHeaders,
  };
}

/**
 * Static corsHeaders kept for backward compatibility.
 * Functions that don't yet pass `req.headers.get('origin')` will use
 * the primary production domain as the allowed origin.
 */
export const corsHeaders = buildCorsHeaders(ALLOWED_ORIGINS[0]);
