/**
 * Feature Flags — lightweight feature gating for Edge Functions.
 * Supports per-tenant flags.
 * 
 * Table schema: feature_flags(id, tenant_id NOT NULL, key, enabled, created_at, updated_at)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * Check if a feature flag is enabled for a tenant.
 * Returns true if flag exists and is enabled.
 * Returns true if flag doesn't exist (fail-open for feature flags — allows features by default).
 * For kill switches, create the flag as enabled=true and set enabled=false to disable.
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagKey: string,
  tenantId?: string,
): Promise<boolean> {
  try {
    if (!tenantId) return true; // No tenant context = allow

    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', flagKey)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) return true; // Fail-open: if we can't check, allow
    if (!data) return true; // Flag not set for this tenant = allow by default

    return data.enabled;
  } catch {
    return true; // Fail-open
  }
}
