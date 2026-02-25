import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getTenantIdForUser } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
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

    // Get tenant_id using helper (handles multiple roles)
    const tenantId = await getTenantIdForUser(supabaseClient, userData.user.id);

    if (!tenantId) throw new Error("Tenant not found");
    logStep("Tenant found", { tenantId });

    // Get current subscription with V4 fields
    const { data: subscription } = await supabaseClient
      .from("tenant_subscriptions")
      .select(`
        stripe_subscription_id,
        stripe_customer_id,
        device_quantity,
        addon_devices,
        is_legacy,
        status,
        trial_end,
        current_period_end,
        plan_id,
        subscription_plans!inner (
          name,
          stripe_price_id,
          max_devices
        )
      `)
      .eq("tenant_id", tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    type SubscriptionWithPlan = typeof subscription & {
      subscription_plans: {
        name: string;
        stripe_price_id: string | null;
        max_devices: number | null;
      };
    };

    const typedSubscription = subscription as SubscriptionWithPlan | null;
    
    // V4: Calculate base_devices from plan config
    const getBaseDevicesForPlan = (planName: string): number => {
      const planBaseDevices: Record<string, number> = {
        'starter_compliance': 10,
        'business': 30,
        'scale': 100,
        'enterprise': 1000,
        'pro': 50,
        'starter': 10,
        'free': 3,
      };
      return planBaseDevices[planName] || 10;
    };

    // Check if it's Enterprise/Custom/Pro plan (without Stripe)
    if (!typedSubscription?.stripe_subscription_id) {
      const planName = typedSubscription?.subscription_plans?.name || "free";
      const isLegacy = typedSubscription?.is_legacy || false;
      const baseDevices = getBaseDevicesForPlan(planName);
      const addonDevices = typedSubscription?.addon_devices || 0;
      
      // If Enterprise, Custom, or Pro plan, return local data
      if (planName === 'enterprise' || planName === 'custom' || planName === 'pro') {
        logStep("Manual plan detected - V4", { 
          planName,
          tenantId,
          deviceQuantity: typedSubscription?.device_quantity,
          status: typedSubscription?.status,
          isLegacy,
        });
        
        // Get features from database
        const { data: features } = await supabaseClient
          .from("tenant_features")
          .select("feature_key, enabled, quota_limit, quota_used")
          .eq("tenant_id", tenantId);

        const featuresMap = features?.reduce((acc: any, f: any) => {
          acc[f.feature_key] = {
            enabled: f.enabled,
            quota_limit: f.quota_limit,
            quota_used: f.quota_used,
          };
          return acc;
        }, {});

        // Count installed agents
        const { count: installedAgents } = await supabaseClient
          .from("agents")
          .select("id", { count: 'exact', head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active");

        const maxDevices = typedSubscription?.subscription_plans?.max_devices || (baseDevices + addonDevices);

        return new Response(
          JSON.stringify({
            subscribed: true,
            plan_name: planName,
            is_legacy: isLegacy,
            base_devices: baseDevices,
            addon_devices: addonDevices,
            total_devices: baseDevices + addonDevices,
            device_quantity: typedSubscription?.device_quantity || 0,
            max_devices: maxDevices,
            installed_agents: installedAgents || 0,
            available_slots: Math.max(0, maxDevices - (installedAgents || 0)),
            status: typedSubscription?.status || 'active',
            trial_end: typedSubscription?.trial_end || null,
            current_period_end: typedSubscription?.current_period_end || null,
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
          is_legacy: false, // V4
          base_devices: 3, // V4
          addon_devices: 0, // V4
          total_devices: 3, // V4
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

    // V4: Get addon price IDs from database
    const { data: addonMappings } = await supabaseClient
      .from("stripe_plan_mapping")
      .select("stripe_price_id")
      .eq("plan_type", "addon");
    
    const ADDON_PRICE_IDS = addonMappings?.map((m: any) => m.stripe_price_id) || [];
    logStep("Loaded addon price IDs from DB", { count: ADDON_PRICE_IDS.length });
    
    let addonDevicesFromStripe = 0;
    for (const item of stripeSubscription.items.data) {
      if (ADDON_PRICE_IDS.includes(item.price.id)) {
        addonDevicesFromStripe += item.quantity || 0;
      }
    }
    
    const planName = typedSubscription.subscription_plans.name;
    const baseDevices = getBaseDevicesForPlan(planName);
    const totalDevices = baseDevices + addonDevicesFromStripe;
    const isLegacy = typedSubscription.is_legacy || false;
    
    logStep("V4 device breakdown", { baseDevices, addonDevicesFromStripe, totalDevices, isLegacy });
    
    const status = stripeSubscription.status;
    const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null;
    const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

    // Update local subscription with V4 fields
    await supabaseClient
      .from("tenant_subscriptions")
      .update({
        device_quantity: totalDevices,
        addon_devices: addonDevicesFromStripe, // V4
        status: status,
        trial_end: trialEnd,
        current_period_end: currentPeriodEnd,
      })
      .eq("tenant_id", tenantId);

    // Sync features with total devices
    await supabaseClient.rpc("ensure_tenant_features", {
      p_tenant_id: tenantId,
      p_plan_name: planName,
      p_device_quantity: totalDevices,
    });

    logStep("Subscription synced successfully");

    // Get updated features
    const { data: features } = await supabaseClient
      .from("tenant_features")
      .select("feature_key, enabled, quota_limit, quota_used")
      .eq("tenant_id", tenantId);

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
        plan_name: planName,
        is_legacy: isLegacy, // V4
        base_devices: baseDevices, // V4
        addon_devices: addonDevicesFromStripe, // V4
        total_devices: totalDevices, // V4
        device_quantity: totalDevices,
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
