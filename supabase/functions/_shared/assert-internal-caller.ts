/**
 * assert-internal-caller.ts
 * 
 * Lightweight auth guard for cron/internal Edge Functions.
 * Validates that the caller is either:
 * 1. Supabase cron scheduler (service_role in Authorization)
 * 2. Internal function-to-function call (X-Internal-Secret)
 * 3. Scheduled invocation (no auth headers = Supabase cron)
 * 
 * Usage:
 *   import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
 *   
 *   Deno.serve(async (req) => {
 *     // ... CORS handling ...
 *     const authError = assertInternalCaller(req);
 *     if (authError) return authError;
 *     // ... rest of handler ...
 *   });
 */

import { corsHeaders } from './cors.ts';
import { timingSafeEqual } from './crypto-utils.ts';
import { logger } from './logger.ts';

export async function assertInternalCaller(req: Request, options?: { allowAuthenticatedUsers?: boolean }): Promise<Response | null> {
  const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY_LEGACY');

  // 1. X-Internal-Secret match (timing-safe)
  if (internalSecret && expectedSecret && await timingSafeEqual(internalSecret, expectedSecret)) {
    logger.info('[assert-internal-caller] Authorized via X-Internal-Secret');
    return null;
  }

  // 2. service_role key in Authorization header (timing-safe)
  if (authHeader && serviceRoleKey && await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`)) {
    logger.info('[assert-internal-caller] Authorized via service_role key');
    return null;
  }

  // 3. Scheduled cron invocation via anon key (timing-safe)
  if (authHeader && anonKey && await timingSafeEqual(authHeader, `Bearer ${anonKey}`)) {
    logger.info('[assert-internal-caller] Authorized via cron anon key');
    return null;
  }

  // 4. Requests without any authentication headers are REJECTED.
  // Scheduled cron invocations are authenticated via anon key (handled in step 3).
  if (!authHeader && !internalSecret) {
    logger.warn('[SECURITY] Rejected: no authentication headers present');
    return new Response(
      JSON.stringify({ error: 'Unauthorized: authentication required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 5. Authenticated user JWT (when explicitly allowed by the caller)
  if (options?.allowAuthenticatedUsers && authHeader && authHeader.startsWith('Bearer ')) {
    // The JWT is present but doesn't match service_role or anon key,
    // so it's likely a user JWT. Let it through ? the calling function
    // is responsible for verifying admin role via Supabase auth.getUser().
    logger.info('[assert-internal-caller] Authorized via user JWT (allowAuthenticatedUsers)');
    return null;
  }

  logger.warn('[SECURITY] Unauthorized access attempt to internal/cron function', {
    hasAuthHeader: !!authHeader,
    hasInternalSecret: !!internalSecret,
  });
  return new Response(
    JSON.stringify({ error: 'Unauthorized: This endpoint is internal only' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
