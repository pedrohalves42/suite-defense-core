import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getTenantIdForUser } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// V4 Stripe Pricing Constants
const STRIPE_PLANS = {
  starter_compliance: {
    priceId: 'price_1Sj531FeHfNScQDP8kMvWUpP',
    baseDevices: 10,
    maxDevices: 50,
  },
  business: {
    priceId: 'price_1Sj53TFeHfNScQDPyAN6B3RG',
    baseDevices: 30,
    maxDevices: 200,
  },
};

const ADDON_PRICES = {
  starter_compliance: 'price_1Sj53iFeHfNScQDPS7pve80k', // R$ 29/device
  business: 'price_1Sj542FeHfNScQDPpgdjaKx1', // R$ 24/device
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: userData.user.id, email: userData.user.email });

    // V4: Accept planName and optional extraDevices
    const { planName, extraDevices = 0 } = await req.json();
    if (!planName) {
      throw new Error("planName is required");
    }

    // Validate plan name
    if (!['starter_compliance', 'business'].includes(planName)) {
      throw new Error("Invalid planName. Must be 'starter_compliance' or 'business'");
    }

    const planConfig = STRIPE_PLANS[planName as keyof typeof STRIPE_PLANS];
    logStep("Request parameters", { planName, extraDevices, planConfig });

    // Validate extra devices
    const totalDevices = planConfig.baseDevices + extraDevices;
    if (totalDevices > planConfig.maxDevices) {
      throw new Error(`Total devices (${totalDevices}) exceeds plan maximum (${planConfig.maxDevices})`);
    }

    // Get tenant_id using helper
    const tenantId = await getTenantIdForUser(supabaseClient, userData.user.id);
    if (!tenantId) throw new Error("Tenant not found");
    logStep("Tenant found", { tenantId });

    // Check for existing active subscription
    const { data: existingSubscription } = await supabaseClient
      .from("tenant_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("tenant_id", tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSubscription?.stripe_subscription_id && existingSubscription?.status === "active") {
      logStep("Active subscription exists", { subscriptionId: existingSubscription.stripe_subscription_id });
      throw new Error("Você já possui uma assinatura ativa. Use o portal do cliente para gerenciar.");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    } else {
      const customer = await stripe.customers.create({ email: userData.user.email });
      customerId = customer.id;
      logStep("New customer created", { customerId });
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price: planConfig.priceId,
        quantity: 1,
      },
    ];

    // Add device addons if needed
    if (extraDevices > 0) {
      const addonPriceId = ADDON_PRICES[planName as keyof typeof ADDON_PRICES];
      lineItems.push({
        price: addonPriceId,
        quantity: extraDevices,
      });
      logStep("Added device addons", { addonPriceId, quantity: extraDevices });
    }

    // Check for MSP coupon eligibility
    const mspCouponId = getMspCouponId(totalDevices);
    logStep("MSP coupon check", { totalDevices, couponId: mspCouponId });

    // Create checkout session
    const origin = req.headers.get("origin") || "http://localhost:8080";
    const trialDays = 14; // V4: 14-day trial standard

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: lineItems,
      mode: "subscription",
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/plan-upgrade?canceled=true`,
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          tenant_id: tenantId,
          plan_name: planName,
          base_devices: planConfig.baseDevices.toString(),
          extra_devices: extraDevices.toString(),
          total_devices: totalDevices.toString(),
        },
      },
      metadata: {
        tenant_id: tenantId,
        plan_name: planName,
        total_devices: totalDevices.toString(),
      },
    };

    // Apply MSP coupon if eligible
    if (mspCouponId) {
      sessionParams.discounts = [{ coupon: mspCouponId }];
      logStep("MSP coupon applied", { couponId: mspCouponId });
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    logStep("Checkout session created", { 
      sessionId: session.id, 
      url: session.url, 
      trialDays,
      totalDevices,
      mspCoupon: mspCouponId,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
