// FORCE REBUILD: 2026-01-03T22:15:00Z - Added x-tenant-id to CORS headers
export const corsHeaders = {
  // CORS headers
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce, x-request-id, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Request-ID, X-Response-Time',
  'Access-Control-Max-Age': '86400',
  
  // Security headers (P0 - Critical)
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '0', // Deprecated, rely on CSP
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
