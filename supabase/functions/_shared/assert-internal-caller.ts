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

export async function assertInternalCaller(
  req: Request, 
  options?: { 
    requireSuperAdmin?: boolean; 
    allowAuthenticated?: boolean;
    /** If true, returns the validated context instead of null on success */
    returnContext?: boolean;
  }
): Promise<Response | { userId: string | null; tenantId: string | null; isInternal: boolean } | null> {
  const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // REMOVED: anonKey check (Security vulnerability SSA-009)

  let validatedUserId: string | null = null;
  let validatedTenantId: string | null = null;
  let isInternal = false;

  // 1. service_role key (Supabase internals or high-privilege scripts)
  if (authHeader && serviceRoleKey && await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`)) {
    logger.info('[assert-internal-caller] Authorized via service_role key');
    isInternal = true;
  }
  // 2. X-Internal-Secret (Inter-function communication)
  else if (internalSecret && expectedSecret && await timingSafeEqual(internalSecret, expectedSecret)) {
    logger.info('[assert-internal-caller] Authorized via X-Internal-Secret');
    isInternal = true;
  }
  // 3. REMOVED: Authorization via anon key (SSA-009)
  // Cron jobs and internal calls MUST use service_role or X-Internal-Secret.
  // 4. Authenticated User or Super Admin
  else if (options?.requireSuperAdmin || options?.allowAuthenticated) {
    const { requireSuperAdmin } = await import('./require-super-admin.ts');
    
    // We reuse requireSuperAdmin logic but it only gives us userId if it passes getUser()
    // To get the tenantId, we'll need to fetch the session or parse metadata
    const authResult = await requireSuperAdmin(req);
    
    if (authResult.success || (options?.allowAuthenticated && authResult.userId)) {
      validatedUserId = authResult.userId || null;
      
      // If super_admin was required but failed, and only allowAuthenticated was set
      if (options?.requireSuperAdmin && !authResult.success) {
        return authResult.response!;
      }

      // CRITICAL: Trust the metadata from the verified user object
      // This is the "Cryptographic Validation" step - relying on the signed JWT 
      // already verified by supabaseClient.auth.getUser() inside requireSuperAdmin.
      if (authResult.user) {
        validatedTenantId = (authResult.user?.app_metadata?.active_tenant_id as string) || null;
      }
    } else {
      return authResult.response || new Response(
        JSON.stringify({ error: 'Unauthorized: Access restricted' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  if (isInternal || validatedUserId) {
    if (options?.returnContext) {
      return { userId: validatedUserId, tenantId: validatedTenantId, isInternal };
    }
    return null;
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
