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
