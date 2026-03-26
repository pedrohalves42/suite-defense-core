/**
 * Security Headers for Edge Functions
 * 
 * P0 - Critical Security Implementation
 * Reference: OWASP Secure Headers Project
 */

// Security headers for JSON API responses (most Edge Functions)
export const securityHeaders: Record<string, string> = {
  // HSTS - enforce HTTPS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // X-XSS-Protection is deprecated in modern browsers - rely on CSP instead
  'X-XSS-Protection': '0',
  
  // Restrict browser features
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  
  // CSP for JSON APIs - very restrictive since no HTML/scripts needed
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",

  // Prevent cross-domain policy files
  'X-Permitted-Cross-Domain-Policies': 'none',
};

// Security headers for HTML responses (if any Edge Function returns HTML)
export const htmlSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '0',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  // More permissive CSP for HTML that might have scripts/styles
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for dynamic UI
    "connect-src 'self' https://*.supabase.co https://api.openai.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

// Combined CORS + Security headers for standard API responses
export const corsSecurityHeaders = {
  // CORS headers
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce, x-request-id, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Request-ID, X-Response-Time',
  'Access-Control-Max-Age': '86400',
  
  // Security headers
  ...securityHeaders,
};

/**
 * Create response with security headers
 */
export function secureJsonResponse(
  body: unknown, 
  status: number = 200,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsSecurityHeaders,
      ...additionalHeaders,
    },
  });
}

/**
 * Create error response with security headers
 */
export function secureErrorResponse(
  message: string,
  status: number = 500,
  details?: Record<string, unknown>
): Response {
  return secureJsonResponse(
    { error: message, ...details },
    status
  );
}

/**
 * Handle CORS preflight with security headers
 */
export function secureCorsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: corsSecurityHeaders,
  });
}
