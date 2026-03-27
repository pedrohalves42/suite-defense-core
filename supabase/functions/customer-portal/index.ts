import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  // Get tenant subscription
  const { data: subscription } = await supabase
    .from("tenant_subscriptions")
    .select("stripe_customer_id, status, plan_id, billing_period, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Handle no Stripe customer
  if (!subscription?.stripe_customer_id) {
    const status = subscription?.status || 'unknown';

    if (status === 'trialing') {
      return { error: 'Você está em período de avaliação gratuita.', code: 'TRIAL_USER', trial: true };
    }
    if (status === 'active' && !subscription?.stripe_customer_id) {
      return { error: 'Você está no plano gratuito.', code: 'FREE_USER', free: true };
    }
    return { error: 'Nenhuma assinatura ativa encontrada.', code: 'NO_SUBSCRIPTION' };
  }

  const billingPeriod = subscription?.billing_period || 'monthly';
  const currentPeriodEnd = subscription?.current_period_end;

  if (billingPeriod !== 'monthly' && currentPeriodEnd) {
    const periodEndDate = new Date(currentPeriodEnd);
    const now = new Date();
    if (periodEndDate > now) {
      const daysRemaining = Math.ceil((periodEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      logger.info(`[CUSTOMER-PORTAL] Prepaid plan (${billingPeriod}), ${daysRemaining} days remaining`);
    }
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração de pagamento incompleta.', code: 'STRIPE_NOT_CONFIGURED' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://cybershield.com.br";

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/admin/subscriptions`,
  });

  logger.info(`[CUSTOMER-PORTAL] Portal session created for customer ${subscription.stripe_customer_id}`);

  return {
    url: session.url,
    billing_period: billingPeriod,
    prepaid: billingPeriod !== 'monthly',
    current_period_end: currentPeriodEnd,
  };
}, { methods: ['GET', 'POST'] });
