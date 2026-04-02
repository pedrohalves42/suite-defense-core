/**
 * Feature Flags — lightweight feature gating for Edge Functions.
 * 
 * Supports:
 * - Global flags (tenant_id IS NULL) — override everything
 * - Per-tenant flags
 * - Kill switch pattern: global disabled = denied for ALL tenants
 * 
 * For kill switches (like HONEYPOT_ENABLED):
 * - Create a global flag with enabled=true to enable
 * - Set enabled=false to disable globally (no deploy needed)
 * - Per-tenant overrides only apply if global is enabled or absent
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * Check if a feature flag is enabled.
 * 
 * Priority: global disabled (deny) > tenant flag > global enabled > default (true)
 * 
 * Kill switch: to disable globally without deploy, set a global flag (tenant_id=NULL) to enabled=false.
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagKey: string,
  tenantId?: string,
): Promise<boolean> {
  try {
    // Use the DB function which handles global + tenant priority
    const { data, error } = await supabase.rpc('is_feature_enabled', {
      p_flag_key: flagKey,
      p_tenant_id: tenantId || null,
    });

    if (error) {
      // Fail-open for feature flags, fail-closed for kill switches
      // Since we can't distinguish here, fail-open (existing behavior)
      console.error(`[feature-flags] RPC error for ${flagKey}:`, error.message);
      return true;
    }

    return data === true;
  } catch (err) {
    console.error(`[feature-flags] Exception for ${flagKey}:`, err);
    return true; // Fail-open
  }
}
