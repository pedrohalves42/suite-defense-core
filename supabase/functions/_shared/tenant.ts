import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * Get the tenant_id for a given user
 * Handles cases where users may have multiple roles in the same tenant
 * 
 * @param supabase - Supabase client instance
 * @param userId - User UUID
 * @returns tenant_id or null if not found
 */
export async function getTenantIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getTenantIdForUser] Error:', error);
    return null;
  }

  return data?.tenant_id || null;
}

/**
 * Verify if user belongs to a specific tenant
 * 
 * @param supabase - Supabase client instance
 * @param userId - User UUID
 * @param tenantId - Tenant UUID to verify
 * @returns true if user belongs to tenant, false otherwise
 */
export async function verifyUserTenant(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[verifyUserTenant] Error:', error);
    return false;
  }

  return !!data;
}

/**
 * Get a validated tenant_id, preferring the requested tenant if user has access
 * This allows the frontend to specify which tenant to use for multi-tenant users
 * 
 * @param supabase - Supabase client instance
 * @param userId - User UUID
 * @param requestedTenantId - Optional tenant_id requested by frontend
 * @returns tenant_id or null if not found/unauthorized
 */
export async function getValidatedTenantId(
  supabase: SupabaseClient,
  userId: string,
  requestedTenantId?: string
): Promise<string | null> {
  // If tenant_id was provided, validate user has access
  if (requestedTenantId) {
    const hasAccess = await verifyUserTenant(supabase, userId, requestedTenantId);
    if (hasAccess) {
      return requestedTenantId;
    }
    console.warn('[getValidatedTenantId] User does not have access to requested tenant:', requestedTenantId);
  }
  
  // Fallback to first tenant (backwards compatibility)
  return getTenantIdForUser(supabase, userId);
}
