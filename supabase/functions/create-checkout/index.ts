import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  logger.info(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const STRIPE_PLANS = {
  starter_compliance: { priceId: 'price_1Sj531FeHfNScQDP8kMvWUpP', baseDevices: 10, maxDevices: 50 },
  business: { priceId: 'price_1Sj53TFeHfNScQDPyAN6B3RG', baseDevices: 30, maxDevices: 200 },
};

const ADDON_PRICES = {
  starter_compliance: 'price_1Sj53iFeHfNScQDPS7pve80k',
  business: 'price_1Sj542FeHfNScQDPpgdjaKx1',
};

const MSP_COUPONS = {
  level1: { id: '17IEYGD3', minDevices: 100, percentOff: 15 },
  level2: { id: 'uJ5hLxn9', minDevices: 300, percentOff: 25 },
  level3: { id: 'quY2WQ8h', minDevices: 1000, percentOff: 35 },
};

function getMspCouponId(totalDevices: number): string | null {
  if (totalDevices >= MSP_COUPONS.level3.minDevices) return MSP_COUPONS.level3.id;
  if (totalDevices >= MSP_COUPONS.level2.minDevices) return MSP_COUPONS.level2.id;
  if (totalDevices >= MSP_COUPONS.level1.minDevices) return MSP_COUPONS.level1.id;
  return null;
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  logStep("Function started");

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

  // Get user email for Stripe customer
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
  if (!authUser?.email) throw new Error("User email not found");
  logStep("User email found", { email: authUser.email });

  const { planName, extraDevices = 0 } = body || {};
  if (!planName) throw new Error("planName is required");
  if (!['starter_compliance', 'business'].includes(planName)) throw new Error("Invalid planName");

  const planConfig = STRIPE_PLANS[planName as keyof typeof STRIPE_PLANS];
  logStep("Request parameters", { planName, extraDevices, planConfig });

  const totalDevices = planConfig.baseDevices + extraDevices;
  if (totalDevices > planConfig.maxDevices) {
    throw new Error(`Total devices (${totalDevices}) exceeds plan maximum (${planConfig.maxDevices})`);
  }

  // Check existing active subscription
  const { data: existingSubscription } = await supabase
    .from("tenant_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("tenant_id", tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSubscription?.stripe_subscription_id && existingSubscription?.status === "active") {
    throw new Error("Voce ja possui uma assinatura ativa.");
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const customers = await stripe.customers.list({ email: authUser.email, limit: 1 });
  let customerId: string;
  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  } else {
    const customer = await stripe.customers.create({ email: authUser.email });
    customerId = customer.id;
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: planConfig.priceId, quantity: 1 }];
  if (extraDevices > 0) {
    const addonPriceId = ADDON_PRICES[planName as keyof typeof ADDON_PRICES];
    lineItems.push({ price: addonPriceId, quantity: extraDevices });
  }

  const mspCouponId = getMspCouponId(totalDevices);
  const origin = req.headers.get("origin") || "http://localhost:8080";

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    line_items: lineItems,
    mode: "subscription",
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/admin/plan-upgrade?canceled=true`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { tenant_id: tenantId, plan_name: planName, base_devices: planConfig.baseDevices.toString(), extra_devices: extraDevices.toString(), total_devices: totalDevices.toString() },
    },
    metadata: { tenant_id: tenantId, plan_name: planName, total_devices: totalDevices.toString() },
  };

  if (mspCouponId) {
    sessionParams.discounts = [{ coupon: mspCouponId }];
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  logStep("Checkout session created", { sessionId: session.id, url: session.url });

  return { url: session.url };
}, { methods: ['POST'] });
