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
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY_LEGACY');

  // 1. X-Internal-Secret match
  if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
    console.log('[assert-internal-caller] Authorized via X-Internal-Secret');
    return null;
  }

  // 2. service_role key in Authorization header
  if (authHeader && serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
    console.log('[assert-internal-caller] Authorized via service_role key');
    return null;
  }

  // 3. Scheduled cron invocation via anon key (pg_cron + pg_net pattern)
  if (authHeader && anonKey && authHeader === `Bearer ${anonKey}`) {
    console.log('[assert-internal-caller] Authorized via cron anon key');
    return null;
  }

  // 4. Direct scheduled invocation without headers
  if (!authHeader && !internalSecret) {
    console.log('[assert-internal-caller] Authorized via scheduled invocation without headers');
    return null;
  }

  console.warn('[SECURITY] Unauthorized access attempt to internal/cron function', {
    hasAuthHeader: !!authHeader,
    hasInternalSecret: !!internalSecret,
  });
  return new Response(
    JSON.stringify({ error: 'Unauthorized: This endpoint is internal only' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
