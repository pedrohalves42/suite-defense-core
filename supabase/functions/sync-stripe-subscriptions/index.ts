/**
 * sync-stripe-subscriptions - Syncs subscription status from Stripe
 * Migrated to serveInternal middleware
 */
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;

  logger.info(`[sync-stripe-subscriptions][${requestId}] Starting sync`);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

  const { data: subscriptions, error } = await supabase
    .from('tenant_subscriptions')
    .select(`tenant_id, stripe_subscription_id, status, subscription_plans!inner(name)`)
    .not('stripe_subscription_id', 'is', null);

  if (error) throw error;

  let syncedCount = 0;
  let errorCount = 0;

  const typedSubscriptions = (subscriptions || []).map((sub: Record<string, unknown>) => ({
    tenant_id: sub.tenant_id as string,
    stripe_subscription_id: sub.stripe_subscription_id as string,
    status: sub.status as string,
    plan_name: (sub.subscription_plans as Record<string, unknown>)?.name as string || 'free',
  }));

  for (const sub of typedSubscriptions) {
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

      const quantity = stripeSubscription.items.data[0]?.quantity || 1;
      const status = stripeSubscription.status;
      const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null;
      const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

      if (sub.status !== status) {
        await supabase
          .from('tenant_subscriptions')
          .update({ device_quantity: quantity, status, trial_end: trialEnd, current_period_end: currentPeriodEnd })
          .eq('tenant_id', sub.tenant_id);

        await supabase.rpc('ensure_tenant_features', {
          p_tenant_id: sub.tenant_id,
          p_plan_name: sub.plan_name,
          p_device_quantity: quantity,
        });

        logger.info(`[sync-stripe-subscriptions][${requestId}] Synced ${sub.tenant_id}: ${sub.status} -> ${status}`);
        syncedCount++;
      }
    } catch (err) {
      logger.error(`[sync-stripe-subscriptions][${requestId}] Error syncing ${sub.tenant_id}:`, err);
      errorCount++;
    }
  }

  logger.info(`[sync-stripe-subscriptions][${requestId}] Complete: ${syncedCount} synced, ${errorCount} errors`);
  return { success: true, synced: syncedCount, errors: errorCount };
});
