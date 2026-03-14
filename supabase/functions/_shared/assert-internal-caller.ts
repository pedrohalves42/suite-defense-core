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

export function assertInternalCaller(req: Request): Response | null {
  const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // 1. X-Internal-Secret match
  if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
    console.log('[assert-internal-caller] Authorized via X-Internal-Secret');
    return null; // Authorized
  }

  // 2. service_role key in Authorization header (Supabase cron scheduler)
  if (authHeader && serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
    console.log('[assert-internal-caller] Authorized via service_role key');
    return null; // Authorized
  }

  // V-11001 FIX: REMOVED anon key passthrough.
  // The anon key is PUBLIC and accepting it would allow ANY frontend client
  // to call internal/cron functions. Supabase cron uses service_role (handled in #2).
  // Previous code accepted anon key under the false assumption that cron uses it.

  // If there IS an auth header but it doesn't match service_role,
  // this is an unauthorized external caller
  console.warn('[SECURITY] Unauthorized access attempt to internal/cron function', {
    hasAuthHeader: !!authHeader,
    hasInternalSecret: !!internalSecret,
  });
  return new Response(
    JSON.stringify({ error: 'Unauthorized: This endpoint is internal only' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
