/**
 * check-subscription - Verify Stripe subscription status and sync to DB
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();

  try {
    const supabaseAdmin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseAnon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    // Find Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false, plan: 'free' }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false, plan: 'free' }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
        status: 200,
      });
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

    // Get tenant_id from body or metadata
    let tenantId: string | null = null;
    try {
      const body = await req.json();
      tenantId = body.tenantId || null;
    } catch { /* no body */ }

    // Sync to tenant_subscriptions if tenantId provided
    if (tenantId) {
      const { data: plan } = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('name', planName === 'business' ? 'business' : 'starter')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (plan) {
        await supabaseAdmin
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

    return new Response(JSON.stringify({
      subscribed: true,
      plan: planName,
      product_id: productId,
      subscription_end: currentPeriodEnd,
      stripe_subscription_id: subscription.id,
    }), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CHECK-SUB] Error', { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
