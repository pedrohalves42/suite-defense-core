import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId } = ctx;

  // Check if subscription already exists
  const { data: existingSubscription } = await supabase
    .from('tenant_subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .single();

  if (existingSubscription) {
    return {
      success: true,
      message: 'Subscription already exists',
      subscription_id: existingSubscription.id,
    };
  }

  // Get Free plan
  const { data: freePlan } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('name', 'Free')
    .single();

  if (!freePlan) {
    return new Response(
      JSON.stringify({ error: 'Free plan not found' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create trial subscription (14 days)
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 14);

  const { data: subscription, error: subscriptionError } = await supabase
    .from('tenant_subscriptions')
    .insert({
      tenant_id: tenantId,
      plan_id: freePlan.id,
      status: 'trialing',
      trial_end: trialEndDate.toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: trialEndDate.toISOString(),
    })
    .select()
    .single();

  if (subscriptionError) {
    logger.error(`[create-trial-subscription][${requestId}] Error:`, subscriptionError);
    throw subscriptionError;
  }

  logger.info(`[create-trial-subscription][${requestId}] Trial created for tenant ${tenantId}, expires ${trialEndDate.toISOString()}`);

  return {
    success: true,
    subscription,
    trial_days: 14,
    trial_end: trialEndDate.toISOString(),
  };
}, { methods: ['POST'] });
