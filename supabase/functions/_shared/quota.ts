import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

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
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !feature) {
      // If feature doesn't exist, check plan-level limit from subscription_plans
      logger.info(`[QUOTA] Feature ${featureKey} not found in tenant_features for tenant ${tenantId}, checking subscription plan`);

      const { data: sub } = await supabase
        .from('tenant_subscriptions')
        .select('subscription_plans!inner(max_agents, max_devices, max_users, max_scans_per_month)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const plan = (sub as Record<string, unknown>)?.subscription_plans as Record<string, number | null> | undefined;
      if (plan) {
        const planLimitMap: Record<string, number | null> = {
          max_agents: plan.max_agents,
          max_devices: plan.max_devices,
          max_users: plan.max_users,
          max_scans_per_month: plan.max_scans_per_month,
        };
        const planLimit = planLimitMap[featureKey];
        if (planLimit !== null && planLimit !== undefined) {
          // Count current usage based on feature key
          let currentUsage = 0;
          if (featureKey === 'max_agents' || featureKey === 'max_devices') {
            const { count } = await supabase
              .from('agents').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).eq('status', 'active');
            currentUsage = count || 0;
          }
          if (currentUsage >= planLimit) {
            return {
              allowed: false,
              error: `Limite do plano atingido para '${featureKey}'. Uso: ${currentUsage}/${planLimit}. Faça upgrade para adicionar mais.`,
              current: currentUsage,
              limit: planLimit,
            };
          }
          return { allowed: true, current: currentUsage, limit: planLimit };
        }
      }

      // No plan found or no limit for this feature — default to free plan limit (2 agents)
      if (featureKey === 'max_agents' || featureKey === 'max_devices') {
        const FREE_LIMIT = 2;
        const { count } = await supabase
          .from('agents').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('status', 'active');
        const currentUsage = count || 0;
        if (currentUsage >= FREE_LIMIT) {
          return {
            allowed: false,
            error: `Limite do plano gratuito atingido (${FREE_LIMIT} agentes). Faça upgrade para adicionar mais.`,
            current: currentUsage,
            limit: FREE_LIMIT,
          };
        }
        return { allowed: true, current: currentUsage, limit: FREE_LIMIT };
      }

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
    logger.error('[QUOTA] Error checking quota:', error);
    // On error, fail open (allow operation) to prevent blocking legitimate requests
    return { allowed: true };
  }
}
