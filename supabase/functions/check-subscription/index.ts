import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
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

    // Get tenant_id
    const { data: userRole } = await supabaseClient
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", userData.user.id)
      .single();

    if (!userRole) throw new Error("Tenant not found");
    logStep("Tenant found", { tenantId: userRole.tenant_id });

    // Get current subscription
    const { data: subscription } = await supabaseClient
      .from("tenant_subscriptions")
      .select(`
        stripe_subscription_id,
        stripe_customer_id,
        device_quantity,
        status,
        trial_end,
        current_period_end,
        plan_id,
        subscription_plans!inner (
          name,
          stripe_price_id
        )
      `)
      .eq("tenant_id", userRole.tenant_id)
      .single();

    type SubscriptionWithPlan = typeof subscription & {
      subscription_plans: {
        name: string;
        stripe_price_id: string | null;
      };
    };

    const typedSubscription = subscription as SubscriptionWithPlan | null;

    // Check if it's Enterprise/Custom plan (without Stripe)
    if (!typedSubscription?.stripe_subscription_id) {
      const planName = typedSubscription?.subscription_plans?.name || "free";
      
      // If Enterprise or Custom plan, return local data
      if (planName === 'enterprise' || planName === 'custom') {
        logStep("Enterprise/Custom plan detected - using local data", { planName });
        
        // Get features from database
        const { data: features } = await supabaseClient
          .from("tenant_features")
          .select("feature_key, enabled, quota_limit, quota_used")
          .eq("tenant_id", userRole.tenant_id);

        const featuresMap = features?.reduce((acc: any, f: any) => {
          acc[f.feature_key] = {
            enabled: f.enabled,
            quota_limit: f.quota_limit,
            quota_used: f.quota_used,
          };
          return acc;
        }, {});

        return new Response(
          JSON.stringify({
            subscribed: true, // Enterprise is always subscribed
            plan_name: planName,
            device_quantity: typedSubscription?.device_quantity || 0,
            status: typedSubscription?.status || 'active',
            trial_end: null,
            current_period_end: null, // No period for Enterprise
            features: featuresMap,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      
      // For Free plan or no subscription
      logStep("No Stripe subscription found - Free plan");
      return new Response(
        JSON.stringify({
          subscribed: false,
          plan_name: "free",
          device_quantity: 0,
          status: "inactive",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Found local subscription", { subscriptionId: typedSubscription.stripe_subscription_id });

    // Fetch from Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripeSubscription = await stripe.subscriptions.retrieve(typedSubscription.stripe_subscription_id);
    logStep("Fetched Stripe subscription", { status: stripeSubscription.status });

    // Get quantity from line items
    const quantity = stripeSubscription.items.data[0]?.quantity || 1;
    const status = stripeSubscription.status;
    const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null;
    const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

    // Update local subscription
    await supabaseClient
      .from("tenant_subscriptions")
      .update({
        device_quantity: quantity,
        status: status,
        trial_end: trialEnd,
        current_period_end: currentPeriodEnd,
      })
      .eq("tenant_id", userRole.tenant_id);

    // Sync features
    await supabaseClient.rpc("ensure_tenant_features", {
      p_tenant_id: userRole.tenant_id,
      p_plan_name: typedSubscription.subscription_plans.name,
      p_device_quantity: quantity,
    });

    logStep("Subscription synced successfully");

    // Get updated features
    const { data: features } = await supabaseClient
      .from("tenant_features")
      .select("feature_key, enabled, quota_limit, quota_used")
      .eq("tenant_id", userRole.tenant_id);

    const featuresMap = features?.reduce((acc: any, f: any) => {
      acc[f.feature_key] = {
        enabled: f.enabled,
        quota_limit: f.quota_limit,
        quota_used: f.quota_used,
      };
      return acc;
    }, {});

    return new Response(
      JSON.stringify({
        subscribed: ["active", "trialing"].includes(status),
        plan_name: typedSubscription.subscription_plans.name,
        device_quantity: quantity,
        status: status,
        trial_end: trialEnd,
        current_period_end: currentPeriodEnd,
        features: featuresMap,
      }),
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
