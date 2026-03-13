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
    return null; // Authorized
  }

  // 2. service_role key in Authorization header (Supabase cron scheduler)
  if (authHeader && serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
    return null; // Authorized
  }

  // 3. Supabase cron invocation (anon key in Authorization — cron uses this)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (authHeader && anonKey && authHeader === `Bearer ${anonKey}`) {
    return null; // Authorized (cron scheduler)
  }

  // V-10001 FIX: REMOVED unsafe no-auth passthrough.
  // Previously allowed ANY request with no auth headers, enabling external attackers
  // to call internal functions by simply omitting Authorization.
  // Supabase cron ALWAYS sends the anon key in Authorization (handled above in #3).

  // 5. If there IS an auth header but it doesn't match service_role or anon_key,
  // this is an unauthorized external caller
  console.warn('[SECURITY] Unauthorized access attempt to internal/cron function');
  return new Response(
    JSON.stringify({ error: 'Unauthorized: This endpoint is internal only' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
