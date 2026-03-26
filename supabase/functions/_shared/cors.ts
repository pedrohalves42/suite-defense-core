// FORCE REBUILD: 2026-03-26T00:00:00Z - Added Supabase client headers + security headers re-export
import { securityHeaders } from './security-headers.ts';

export const corsHeaders = {
  // CORS headers
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce, x-request-id, x-tenant-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Request-ID, X-Response-Time',
  'Access-Control-Max-Age': '86400',

  // Security headers (P0 - Critical) - merged from security-headers.ts
  ...securityHeaders,
};
