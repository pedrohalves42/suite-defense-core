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

    // Get request body - V4: planName + optional billingPeriod for package discounts
    const { planName, billingPeriod = 'monthly' } = await req.json();
    if (!planName) {
      throw new Error("planName is required");
    }
    logStep("Request parameters", { planName, billingPeriod });

    // Validate billing period
    const validPeriods = ['monthly', '6m', '12m', '24m'];
    if (!validPeriods.includes(billingPeriod)) {
      throw new Error("billingPeriod must be one of: monthly, 6m, 12m, 24m");
    }

    // Get tenant_id using helper (handles multiple roles)
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

    // Build plan name with billing period suffix
    const fullPlanName = billingPeriod === 'monthly' ? planName : `${planName}_${billingPeriod}`;
    logStep("Looking for plan", { fullPlanName });

    // Get plan details with billing period
    const { data: plan, error: planError } = await supabaseClient
      .from("subscription_plans")
      .select("stripe_price_id, max_devices, price_per_device, trial_days, billing_period, discount_pct")
      .eq("name", fullPlanName)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (planError) {
      logStep("Plan query error", { error: planError.message });
      throw new Error(`Erro ao buscar plano: ${planError.message}`);
    }

    if (!plan) {
      // Fallback to monthly plan if period variant doesn't exist
      const { data: monthlyPlan } = await supabaseClient
        .from("subscription_plans")
        .select("stripe_price_id, max_devices, price_per_device, trial_days, billing_period, discount_pct")
        .eq("name", planName)
        .eq("billing_period", "monthly")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      
      if (!monthlyPlan?.stripe_price_id) {
        throw new Error("Plano não encontrado ou não configurado no Stripe");
      }
      logStep("Using monthly fallback", { planName });
    }

    const selectedPlan = plan || null;
    if (!selectedPlan?.stripe_price_id) {
      throw new Error("Plano não configurado no Stripe. Configure os produtos primeiro.");
    }

    logStep("Plan validated", { 
      priceId: selectedPlan.stripe_price_id, 
      maxDevices: selectedPlan.max_devices,
      billingPeriod: selectedPlan.billing_period,
      discountPct: selectedPlan.discount_pct
    });

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

    // Create checkout session - V4: Fixed price with package discounts
    const origin = req.headers.get("origin") || "http://localhost:8080";
    const trialDays = selectedPlan.trial_days || 14;

    // Calculate months for metadata
    const monthsMap: Record<string, number> = { 'monthly': 1, '6m': 6, '12m': 12, '24m': 24 };
    const months = monthsMap[billingPeriod] || 1;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: selectedPlan.stripe_price_id,
          quantity: 1, // V4: Fixed price per plan, not per device
        },
      ],
      mode: "subscription",
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/plan-upgrade?canceled=true`,
      subscription_data: {
        trial_period_days: trialDays, // PLG: Collect card at start, charge after trial
        metadata: {
          tenant_id: tenantId,
          plan_name: planName,
          billing_period: billingPeriod,
          discount_pct: (selectedPlan.discount_pct || 0).toString(),
          max_devices: selectedPlan.max_devices.toString(),
          contract_months: months.toString(),
        },
      },
      metadata: {
        tenant_id: tenantId,
        plan_name: planName,
        billing_period: billingPeriod,
        discount_pct: (selectedPlan.discount_pct || 0).toString(),
        max_devices: selectedPlan.max_devices.toString(),
      },
    });

    logStep("Checkout session created", { 
      sessionId: session.id, 
      url: session.url, 
      trialDays,
      billingPeriod,
      discountApplied: selectedPlan.discount_pct 
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
