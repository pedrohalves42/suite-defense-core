/**
 * check-subscription - Verify Stripe subscription status and sync to DB
 * Migrated to serveTenant middleware
 */
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const CheckSubBodySchema = z.object({
  tenantId: z.string().uuid().optional(),
}).passthrough();
type CheckSubBody = z.infer<typeof CheckSubBodySchema>;

serveTenant<CheckSubBody>(async (req, ctx) => {
  const parsed = CheckSubBodySchema.safeParse(ctx.body ?? {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'invalid_payload', details: parsed.error.flatten() }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get user email for Stripe lookup
  const { data: { user }, error: userErr } = await ctx.supabase.auth.admin.getUserById(ctx.userId!);
  if (userErr || !user?.email) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil', httpClient: Stripe.createFetchHttpClient(), timeout: 10_000 });

  // Find Stripe customer
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  if (customers.data.length === 0) {
    return { subscribed: false, plan: 'free' };
  }

  const customerId = customers.data[0].id;
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    return { subscribed: false, plan: 'free' };
  }

  const subscription = subscriptions.data[0];
  const priceId = subscription.items.data[0].price.id;
  const productId = subscription.items.data[0].price.product as string;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  // Determine plan from price
  let planName = 'starter';
  if (priceId.includes('lV8') || productId.includes('U81Y')) {
    planName = 'business';
  }

  // Sync to tenant_subscriptions using ctx.tenantId (resolved by middleware)
  const tenantId = ctx.body?.tenantId || ctx.tenantId;
  if (tenantId) {
    const { data: plan } = await ctx.supabase
      .from('subscription_plans')
      .select('id')
      .eq('name', planName === 'business' ? 'business' : 'starter')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (plan) {
      await ctx.supabase
        .from('tenant_subscriptions')
        .update({
          plan_id: plan.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: 'active',
          current_period_end: currentPeriodEnd,
        })
        .eq('tenant_id', tenantId);

      logger.info('[CHECK-SUB] Synced subscription', { tenantId, planName });
    }
  }

  return {
    subscribed: true,
    plan: planName,
    product_id: productId,
    subscription_end: currentPeriodEnd,
    stripe_subscription_id: subscription.id,
  };
}, {
  methods: ['POST', 'GET'],
  rateLimit: { endpoint: 'check-subscription', maxRequests: 10, windowMinutes: 1 },
});
