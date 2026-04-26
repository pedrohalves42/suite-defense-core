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

export async function assertInternalCaller(req: Request, options?: { requireSuperAdmin?: boolean }): Promise<Response | null> {
  const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY_LEGACY');

  // 1. service_role key (Supabase internals or high-privilege scripts)
  if (authHeader && serviceRoleKey && await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`)) {
    logger.info('[assert-internal-caller] Authorized via service_role key');
    return null;
  }

  // 2. X-Internal-Secret (Inter-function communication)
  if (internalSecret && expectedSecret && await timingSafeEqual(internalSecret, expectedSecret)) {
    logger.info('[assert-internal-caller] Authorized via X-Internal-Secret');
    return null;
  }

  // 3. Cron Scheduler (Identified via anon key in cron invocations)
  if (authHeader && anonKey && await timingSafeEqual(authHeader, `Bearer ${anonKey}`)) {
    logger.info('[assert-internal-caller] Authorized via cron anon key');
    return null;
  }

  // 4. Require Role (Human Super Admin) - Mandatory for proxy/gateway usage if not internal
  if (options?.requireSuperAdmin) {
    const { requireSuperAdmin } = await import('./require-super-admin.ts');
    const authResult = await requireSuperAdmin(req);
    if (authResult.success) {
      logger.info('[assert-internal-caller] Authorized via verified super_admin role');
      return null;
    }
    return authResult.response!;
  }

  logger.warn('[SECURITY] Unauthorized access attempt to internal/cron function', {
    hasAuthHeader: !!authHeader,
    hasInternalSecret: !!internalSecret,
    requireSuperAdmin: !!options?.requireSuperAdmin
  });

  return new Response(
    JSON.stringify({ error: 'Unauthorized: Access restricted to system or super_admin' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
