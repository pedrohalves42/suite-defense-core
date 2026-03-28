/**
 * Feature Flags — lightweight feature gating for Edge Functions.
 * Supports per-tenant flags with percentage-based rollout.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

interface FeatureFlag {
  enabled: boolean;
  rollout_pct: number;
  tenant_id: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Check if a feature flag is enabled.
 * 
 * @param supabase - Service-role client
 * @param flagName - Flag name (e.g. 'ecdsa_v2', 'new_dashboard')
 * @param tenantId - Optional tenant for tenant-specific flags
 * @param entityId - Optional entity (agent/user) for percentage rollout (deterministic hash)
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagName: string,
  tenantId?: string,
  entityId?: string,
): Promise<boolean> {
  try {
    // Look for tenant-specific flag first, then global
    let query = supabase
      .from('feature_flags')
      .select('enabled, rollout_pct, tenant_id, metadata')
      .eq('name', flagName);

    if (tenantId) {
      // Get both global (tenant_id IS NULL) and tenant-specific
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

    if (!flag.enabled) return false;
    if (flag.rollout_pct >= 100) return true;
    if (flag.rollout_pct <= 0) return false;

    // Deterministic rollout based on entityId
    if (!entityId) return false;

    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${flagName}:${entityId}`),
    );
    const bucket = new Uint8Array(hash)[0] % 100;
    return bucket < flag.rollout_pct;
  } catch (err) {
    logger.warn(`[FeatureFlags] Error checking '${flagName}':`, String(err));
    return false; // Fail closed
  }
}

/**
 * Get flag metadata (arbitrary JSON config attached to a flag).
 */
export async function getFlagMetadata<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  flagName: string,
  tenantId?: string,
): Promise<T | null> {
  const { data } = await supabase
    .from('feature_flags')
    .select('metadata')
    .eq('name', flagName)
    .or(tenantId ? `tenant_id.is.null,tenant_id.eq.${tenantId}` : 'tenant_id.is.null')
    .limit(1)
    .maybeSingle();

  return (data?.metadata as T) ?? null;
}
