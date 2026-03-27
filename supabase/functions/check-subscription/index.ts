import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  logger.info(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  logStep("Function started", { tenantId });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

  // Get current subscription with V4 fields
  const { data: subscription } = await supabase
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
    subscription_plans: { name: string; stripe_price_id: string | null; max_devices: number | null };
  };

  const typedSubscription = subscription as SubscriptionWithPlan | null;

  const getBaseDevicesForPlan = (planName: string): number => {
    const planBaseDevices: Record<string, number> = {
      'starter_compliance': 10, 'business': 30, 'scale': 100,
      'enterprise': 1000, 'pro': 50, 'starter': 10, 'free': 3,
    };
    return planBaseDevices[planName] || 10;
  };

  // Check if Enterprise/Custom/Pro (no Stripe)
  if (!typedSubscription?.stripe_subscription_id) {
    const planName = typedSubscription?.subscription_plans?.name || "free";
    const isLegacy = typedSubscription?.is_legacy || false;
    const baseDevices = getBaseDevicesForPlan(planName);
    const addonDevices = typedSubscription?.addon_devices || 0;

    if (planName === 'enterprise' || planName === 'custom' || planName === 'pro') {
      logStep("Manual plan detected - V4", { planName, tenantId });

      const { data: features } = await supabase
        .from("tenant_features")
        .select("feature_key, enabled, quota_limit, quota_used")
        .eq("tenant_id", tenantId);

      const featuresMap = features?.reduce((acc: any, f: any) => {
        acc[f.feature_key] = { enabled: f.enabled, quota_limit: f.quota_limit, quota_used: f.quota_used };
        return acc;
      }, {});

      const { count: installedAgents } = await supabase
        .from("agents")
        .select("id", { count: 'exact', head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active");

      const maxDevices = typedSubscription?.subscription_plans?.max_devices || (baseDevices + addonDevices);

      return {
        subscribed: true, plan_name: planName, is_legacy: isLegacy,
        base_devices: baseDevices, addon_devices: addonDevices, total_devices: baseDevices + addonDevices,
        device_quantity: typedSubscription?.device_quantity || 0, max_devices: maxDevices,
        installed_agents: installedAgents || 0,
        available_slots: Math.max(0, maxDevices - (installedAgents || 0)),
        status: typedSubscription?.status || 'active',
        trial_end: typedSubscription?.trial_end || null,
        current_period_end: typedSubscription?.current_period_end || null,
        features: featuresMap,
      };
    }

    logStep("No Stripe subscription found - Free plan");
    return {
      subscribed: false, plan_name: "free", is_legacy: false,
      base_devices: 3, addon_devices: 0, total_devices: 3, device_quantity: 0, status: "inactive",
    };
  }

  logStep("Found local subscription", { subscriptionId: typedSubscription.stripe_subscription_id });

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const stripeSubscription = await stripe.subscriptions.retrieve(typedSubscription.stripe_subscription_id);
  logStep("Fetched Stripe subscription", { status: stripeSubscription.status });

  const { data: addonMappings } = await supabase
    .from("stripe_plan_mapping")
    .select("stripe_price_id")
    .eq("plan_type", "addon");

  const ADDON_PRICE_IDS = addonMappings?.map((m: any) => m.stripe_price_id) || [];
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

  const status = stripeSubscription.status;
  const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null;
  const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

  await supabase
    .from("tenant_subscriptions")
    .update({ device_quantity: totalDevices, addon_devices: addonDevicesFromStripe, status, trial_end: trialEnd, current_period_end: currentPeriodEnd })
    .eq("tenant_id", tenantId);

  await supabase.rpc("ensure_tenant_features", { p_tenant_id: tenantId, p_plan_name: planName, p_device_quantity: totalDevices });

  const { data: features } = await supabase
    .from("tenant_features")
    .select("feature_key, enabled, quota_limit, quota_used")
    .eq("tenant_id", tenantId);

  const featuresMap = features?.reduce((acc: any, f: any) => {
    acc[f.feature_key] = { enabled: f.enabled, quota_limit: f.quota_limit, quota_used: f.quota_used };
    return acc;
  }, {});

  return {
    subscribed: ["active", "trialing"].includes(status),
    plan_name: planName, is_legacy: isLegacy,
    base_devices: baseDevices, addon_devices: addonDevicesFromStripe,
    total_devices: totalDevices, device_quantity: totalDevices,
    status, trial_end: trialEnd, current_period_end: currentPeriodEnd, features: featuresMap,
  };
}, { methods: ['GET', 'POST'] });
