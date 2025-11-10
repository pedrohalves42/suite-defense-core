import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
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

    // Get request body
    const { planName, deviceQuantity } = await req.json();
    if (!planName || !deviceQuantity) {
      throw new Error("planName and deviceQuantity are required");
    }
    logStep("Request parameters", { planName, deviceQuantity });

    // Get tenant_id
    const { data: userRole } = await supabaseClient
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", userData.user.id)
      .single();

    if (!userRole) throw new Error("Tenant not found");
    logStep("Tenant found", { tenantId: userRole.tenant_id });

    // Check for existing active subscription
    const { data: existingSubscription } = await supabaseClient
      .from("tenant_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("tenant_id", userRole.tenant_id)
      .single();

    if (existingSubscription?.stripe_subscription_id && existingSubscription?.status === "active") {
      logStep("Active subscription exists", { subscriptionId: existingSubscription.stripe_subscription_id });
      throw new Error("Você já possui uma assinatura ativa. Use o portal do cliente para gerenciar.");
    }

    // Get plan details
    const { data: plan } = await supabaseClient
      .from("subscription_plans")
      .select("stripe_price_id, max_devices, price_per_device")
      .eq("name", planName)
      .single();

    if (!plan?.stripe_price_id) throw new Error("Plan not found or not configured");
    if (deviceQuantity < 1 || deviceQuantity > plan.max_devices) {
      throw new Error(`Device quantity must be between 1 and ${plan.max_devices}`);
    }
    logStep("Plan validated", { priceId: plan.stripe_price_id, maxDevices: plan.max_devices });

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

    // Create checkout session
    const origin = req.headers.get("origin") || "http://localhost:8080";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: deviceQuantity,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/plan-upgrade?canceled=true`,
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          tenant_id: userRole.tenant_id,
          plan_name: planName,
          device_quantity: deviceQuantity.toString(),
        },
      },
      metadata: {
        tenant_id: userRole.tenant_id,
        plan_name: planName,
        device_quantity: deviceQuantity.toString(),
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

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
