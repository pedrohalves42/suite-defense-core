import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface QuotaCheckResult {
  allowed: boolean;
  error?: string;
  current?: number;
  limit?: number;
}

/**
 * Check if a tenant has available quota for a specific feature
 * @param supabase Supabase client
 * @param tenantId Tenant ID
 * @param featureKey Feature key (e.g., 'max_agents', 'max_scans_per_month', 'max_users')
 * @returns QuotaCheckResult indicating if the operation is allowed
 */
export async function checkQuotaAvailable(
  supabase: SupabaseClient,
  tenantId: string,
  featureKey: string
): Promise<QuotaCheckResult> {
  try {
    // Query tenant_features for the specific feature
    const { data: feature, error } = await supabase
      .from('tenant_features')
      .select('enabled, quota_limit, quota_used')
      .eq('tenant_id', tenantId)
      .eq('feature_key', featureKey)
      .single();

    if (error) {
      // If feature doesn't exist, assume no quota limit (allowed)
      console.log(`[QUOTA] Feature ${featureKey} not found for tenant ${tenantId}, allowing by default`);
      return { allowed: true };
    }

    // Check if feature is enabled
    if (!feature.enabled) {
      return {
        allowed: false,
        error: `Recurso '${featureKey}' desabilitado para este tenant`,
      };
    }

    // If no quota limit set, allow unlimited usage
    if (feature.quota_limit === null) {
      return { allowed: true };
    }

    // Check if quota is exceeded
    const quotaUsed = feature.quota_used || 0;
    const quotaLimit = feature.quota_limit;

    if (quotaUsed >= quotaLimit) {
      return {
        allowed: false,
        error: `Quota excedida para '${featureKey}'. Uso: ${quotaUsed}/${quotaLimit}`,
        current: quotaUsed,
        limit: quotaLimit,
      };
    }

    // Quota available
    return {
      allowed: true,
      current: quotaUsed,
      limit: quotaLimit,
    };
  } catch (error) {
    console.error('[QUOTA] Error checking quota:', error);
    // On error, fail open (allow operation) to prevent blocking legitimate requests
    return { allowed: true };
  }
}
