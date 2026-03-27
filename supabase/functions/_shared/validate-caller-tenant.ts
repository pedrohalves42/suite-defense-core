import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { timingSafeEqual } from './crypto-utils.ts';

interface CallerValidationResult {
  authorized: boolean;
  isInternalCall: boolean;
  userId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * V-1015 FIX: Validate that the caller has access to the requested tenant_id.
 * 
 * Allows:
 * 1. Internal calls via X-Internal-Secret or service_role Authorization
 * 2. Authenticated user calls where user belongs to the tenant
 * 
 * @param req - The incoming request
 * @param supabase - Supabase client (service_role)
 * @param tenantId - The tenant_id from the request body
 */
export async function validateCallerTenant(
  req: Request,
  supabase: SupabaseClient,
  tenantId: string
): Promise<CallerValidationResult> {
  const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization');

  // 1. Check for internal call via secret (timing-safe)
  if (internalSecret && expectedSecret && await timingSafeEqual(internalSecret, expectedSecret)) {
    return { authorized: true, isInternalCall: true };
  }

  // 2. Check for service_role key in Authorization (timing-safe)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (authHeader && serviceRoleKey && await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`)) {
    return { authorized: true, isInternalCall: true };
  }

  // 3. Must be an authenticated user call — validate JWT and tenant access
  if (!authHeader) {
    return { 
      authorized: false, 
      isInternalCall: false, 
      error: 'Authorization required',
      statusCode: 401
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { 
      authorized: false, 
      isInternalCall: false, 
      error: 'Invalid token',
      statusCode: 401
    };
  }

  // Verify user belongs to the requested tenant
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!userRole) {
    console.warn(`[SECURITY] User ${user.id} attempted access to unauthorized tenant ${tenantId}`);
    return { 
      authorized: false, 
      isInternalCall: false, 
      userId: user.id,
      error: 'Access denied: You do not have access to this tenant',
      statusCode: 403
    };
  }

  return { authorized: true, isInternalCall: false, userId: user.id };
}
