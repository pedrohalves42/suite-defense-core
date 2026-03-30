/**
 * Tenant AI eligibility checks and quota management
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export async function checkTenantAIEligibility(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ eligible: boolean; reason?: string }> {
  const { data: subscription, error: subError } = await supabase
    .from('tenant_subscriptions')
    .select('status, trial_end')
    .eq('tenant_id', tenantId)
    .single();

  if (subError || !subscription) {
    return { eligible: false, reason: 'no_subscription' };
  }

  const sub = subscription as { status: string; trial_end: string | null };
  const isActiveSubscription = sub.status === 'active';
  const isValidTrial = sub.status === 'trialing' &&
    sub.trial_end &&
    new Date(sub.trial_end) > new Date();

  if (!isActiveSubscription && !isValidTrial) {
    return { eligible: false, reason: 'subscription_inactive_or_trial_expired' };
  }

  const { data: feature, error: featureError } = await supabase
    .from('tenant_features')
    .select('enabled, quota_limit, quota_used')
    .eq('tenant_id', tenantId)
    .eq('feature_key', 'ai_insights')
    .single();

  if (featureError || !feature) {
    return { eligible: true, reason: 'feature_not_configured_allowing_default' };
  }

  const feat = feature as { enabled: boolean; quota_limit: number | null; quota_used: number };

  if (!feat.enabled) {
    return { eligible: false, reason: 'feature_disabled' };
  }

  if (feat.quota_limit !== null && feat.quota_used >= feat.quota_limit) {
    return { eligible: false, reason: 'quota_exceeded' };
  }

  return { eligible: true };
}

export async function incrementAIQuotaUsage(
  supabase: SupabaseClient,
  tenantId: string,
  insightsCount: number
): Promise<void> {
  try {
    if (!Number.isInteger(insightsCount) || insightsCount < 0 || insightsCount > 1000) {
      logger.info(`[ai-system-analyzer] Invalid insightsCount: ${insightsCount}`);
      return;
    }

    const { data: current, error: selectError } = await supabase
      .from('tenant_features')
      .select('quota_used')
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ai_insights')
      .single();

    if (selectError || !current) {
      logger.info(`[ai-system-analyzer] Could not fetch quota for tenant ${tenantId}:`, selectError);
      return;
    }

    const newQuotaUsed = (current.quota_used || 0) + insightsCount;
    await supabase
      .from('tenant_features')
      .update({ quota_used: newQuotaUsed })
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ai_insights');
  } catch (error) {
    logger.info(`[ai-system-analyzer] Could not increment quota for tenant ${tenantId}:`, error);
  }
}
