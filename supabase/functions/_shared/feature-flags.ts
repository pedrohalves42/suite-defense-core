/**
 * Feature Flags — lightweight feature gating for Edge Functions.
 * Supports per-tenant flags with global fallback.
 * 
 * Table schema: feature_flags(id, tenant_id, key, enabled, created_at, updated_at)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface FeatureFlag {
  enabled: boolean;
  tenant_id: string | null;
}

/**
 * Check if a feature flag is enabled.
 * Looks for tenant-specific flag first, then global (tenant_id IS NULL).
 * Returns false if flag doesn't exist (fail-closed).
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagKey: string,
  tenantId?: string,
): Promise<boolean> {
  try {
    let query = supabase
      .from('feature_flags')
      .select('enabled, tenant_id')
      .eq('key', flagKey);

    if (tenantId) {
      query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      query = query.is('tenant_id', null);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) return false;

    // Prefer tenant-specific flag over global
    const flag: FeatureFlag = (
      data.find((f: FeatureFlag) => f.tenant_id === tenantId) ||
      data.find((f: FeatureFlag) => f.tenant_id === null) ||
      data[0]
    ) as FeatureFlag;

    return flag.enabled;
  } catch {
    return false; // Fail closed
  }
}
