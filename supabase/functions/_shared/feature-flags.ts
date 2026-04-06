/**
 * Feature Flags — lightweight feature gating for Edge Functions.
 * 
 * Supports:
 * - Global flags (tenant_id IS NULL) — override everything
 * - Per-tenant flags
 * - Kill switch pattern: global disabled = denied for ALL tenants
 * 
 * SECURITY: Kill switches default to FAIL-CLOSED (defaultOnError: false).
 * Regular feature flags default to FAIL-OPEN (defaultOnError: true).
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

export interface FeatureFlagOptions {
  /**
   * Value returned when the RPC call fails.
   * - true  = fail-open  (feature stays enabled on error) — use for non-critical features
   * - false = fail-closed (feature is disabled on error)  — USE FOR KILL SWITCHES & SECURITY
   * @default true
   */
  defaultOnError?: boolean;
}

/**
 * Check if a feature flag is enabled.
 * 
 * Priority: global disabled (deny) > tenant flag > global enabled > defaultOnError
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagKey: string,
  tenantId?: string,
  options?: FeatureFlagOptions,
): Promise<boolean> {
  const defaultOnError = options?.defaultOnError ?? true;

  try {
    const { data, error } = await supabase.rpc('is_feature_enabled', {
      p_flag_key: flagKey,
      p_tenant_id: tenantId || null,
    });

    if (error) {
      console.error(`[feature-flags] RPC error for ${flagKey} (defaulting to ${defaultOnError}):`, error.message);
      return defaultOnError;
    }

    return data === true;
  } catch (err) {
    console.error(`[feature-flags] Exception for ${flagKey} (defaulting to ${defaultOnError}):`, err);
    return defaultOnError;
  }
}

/**
 * Convenience: Check a KILL SWITCH flag (fail-closed on error).
 * If the RPC fails, the feature is DISABLED — preventing destructive actions.
 */
export async function isKillSwitchEnabled(
  supabase: SupabaseClient,
  flagKey: string,
  tenantId?: string,
): Promise<boolean> {
  return isFeatureEnabled(supabase, flagKey, tenantId, { defaultOnError: false });
}
