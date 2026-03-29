import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

type Operation = 'upgrade' | 'add_devices' | 'downgrade' | 'cancel';

interface PlanConfig {
  basePriceId: string;
  addonPriceId: string;
  baseDevices: number;
}

// V4: Fetch plan config from database
async function getPlanConfig(supabase: SupabaseClient, planName: string): Promise<PlanConfig | null> {
  const { data: mappings, error } = await supabase
    .from("stripe_plan_mapping")
    .select("plan_type, stripe_price_id, base_devices")
    .eq("logical_plan", planName);
  
  if (error || !mappings || mappings.length === 0) {
    return null;
  }
  
  const base = mappings.find((m: Record<string, unknown>) => m.plan_type === 'base');
  const addon = mappings.find((m: Record<string, unknown>) => m.plan_type === 'addon');
  
  if (!base || !addon) return null;
  
  return {
    basePriceId: base.stripe_price_id,
    addonPriceId: addon.stripe_price_id,
    baseDevices: base.base_devices,
  };
}

// V4: Get all addon price IDs from database
async function getAllAddonPriceIds(supabase: Record<string, unknown>): Promise<string[]> {
  const { data } = await supabase
    .from("stripe_plan_mapping")
    .select("stripe_price_id")
    .eq("plan_type", "addon");
  
  return data?.map((m: Record<string, unknown>) => m.stripe_price_id) || [];
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  const logStep = (step: string, details?: Record<string, unknown>) => {
    const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
    logger.info(`[MANAGE-SUBSCRIPTION][${requestId}] ${step}${detailsStr}`);
  };

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

  logStep("User authenticated", { userId, tenantId });

  const operation: Operation = body.operation;
  const targetPlan: string = body.target_plan;
  const extraDevices: number = body.extra_devices || 0;

  logStep("Operation requested", { operation, targetPlan, extraDevices });

  // Get current subscription
  const { data: subscription } = await supabase
    .from("tenant_subscriptions")
    .select(`
      stripe_subscription_id,
      stripe_customer_id,
      is_legacy,
      plan_id,
      device_quantity,
      addon_devices,
      current_period_end,
      subscription_plans!inner (name)
    `)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!subscription) {
    throw new Error("No subscription found for this tenant");
  }

  const currentPlan = (subscription as Record<string, unknown>).subscription_plans?.name;
  const isLegacy = subscription.is_legacy || false;

  logStep("Current subscription", { currentPlan, isLegacy, subscriptionId: subscription.stripe_subscription_id });

  // V4: Block addon purchases for legacy customers
  if (isLegacy && operation !== 'cancel') {
    return new Response(
      JSON.stringify({
        error: "LEGACY_BLOCK",
        message: "Para expandir dispositivos ou fazer upgrade, e necessario migrar para os planos atuais.",
        requires_migration: true,
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  
  const allAddonPriceIds = await getAllAddonPriceIds(supabase);
  logStep("Loaded addon price IDs from DB", { count: allAddonPriceIds.length });

  let result: Record<string, unknown> = {};

  switch (operation) {
    case "upgrade": {
      if (!subscription.stripe_subscription_id) {
        throw new Error("No active Stripe subscription to upgrade");
      }

      const newConfig = await getPlanConfig(supabase, targetPlan);
      if (!newConfig) {
        throw new Error(`Invalid target plan: ${targetPlan}`);
      }

      logStep("Target plan config", newConfig);
      
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      
      const items: Stripe.SubscriptionUpdateParams.Item[] = [];
      
      for (const item of stripeSubscription.items.data) {
        const isAddon = allAddonPriceIds.includes(item.price.id);
        if (!isAddon) {
          items.push({ id: item.id, price: newConfig.basePriceId, quantity: 1 });
        } else {
          items.push({ id: item.id, price: newConfig.addonPriceId, quantity: item.quantity });
        }
      }
      
      if (extraDevices > 0) {
        const existingAddon = stripeSubscription.items.data.find(
          (item: Stripe.SubscriptionItem) => allAddonPriceIds.includes(item.price.id)
        );
        
        if (existingAddon) {
          const addonItem = items.find(i => i.id === existingAddon.id);
          if (addonItem) {
            addonItem.quantity = (addonItem.quantity || 0) + extraDevices;
          }
        } else {
          items.push({ price: newConfig.addonPriceId, quantity: extraDevices });
        }
      }

      const updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        items,
        proration_behavior: 'create_prorations',
        metadata: {
          plan_name: targetPlan,
          max_devices: String(newConfig.baseDevices + extraDevices),
        },
      });

      logStep("Subscription upgraded", { subscriptionId: updatedSubscription.id });

      await supabase.from("subscription_events").insert({
        tenant_id: tenantId,
        event_type: "upgrade",
        old_plan: currentPlan,
        new_plan: targetPlan,
        old_devices: subscription.device_quantity,
        new_devices: newConfig.baseDevices + extraDevices,
        addon_quantity: extraDevices,
        stripe_subscription_id: updatedSubscription.id,
        created_by: userId,
      });

      result = {
        success: true,
        message: `Upgrade para ${targetPlan} realizado com sucesso`,
        new_plan: targetPlan,
        new_devices: newConfig.baseDevices + extraDevices,
      };
      break;
    }

    case "add_devices": {
      if (!subscription.stripe_subscription_id) {
        throw new Error("No active Stripe subscription");
      }

      if (extraDevices <= 0) {
        throw new Error("Must specify positive number of extra devices");
      }

      const planConfig = await getPlanConfig(supabase, currentPlan);
      if (!planConfig) {
        throw new Error(`Cannot add devices to plan: ${currentPlan}`);
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      
      const existingAddon = stripeSubscription.items.data.find(
        (item: Stripe.SubscriptionItem) => item.price.id === planConfig.addonPriceId
      );

      let updatedSubscription;
      if (existingAddon) {
        updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          items: [{ id: existingAddon.id, quantity: (existingAddon.quantity || 0) + extraDevices }],
          proration_behavior: 'create_prorations',
        });
      } else {
        updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          items: [{ price: planConfig.addonPriceId, quantity: extraDevices }],
          proration_behavior: 'create_prorations',
        });
      }

      logStep("Devices added", { extraDevices });

      await supabase.from("subscription_events").insert({
        tenant_id: tenantId,
        event_type: "addon_added",
        old_devices: subscription.device_quantity,
        new_devices: (subscription.device_quantity || 0) + extraDevices,
        addon_quantity: extraDevices,
        stripe_subscription_id: updatedSubscription.id,
        created_by: userId,
      });

      result = {
        success: true,
        message: `${extraDevices} dispositivos adicionados com sucesso`,
        new_total_devices: (subscription.device_quantity || 0) + extraDevices,
      };
      break;
    }

    case "downgrade": {
      if (!subscription.stripe_subscription_id) {
        throw new Error("No active Stripe subscription");
      }

      const targetConfig = await getPlanConfig(supabase, targetPlan);
      if (!targetConfig) {
        throw new Error(`Invalid target plan: ${targetPlan}`);
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);

      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
        metadata: {
          ...stripeSubscription.metadata,
          pending_downgrade_to: targetPlan,
          downgrade_effective_at: currentPeriodEnd.toISOString(),
        },
      });

      logStep("Downgrade scheduled", { targetPlan, effectiveAt: currentPeriodEnd.toISOString() });

      await supabase
        .from("tenant_subscriptions")
        .update({
          pending_downgrade_to: targetPlan,
          pending_downgrade_at: currentPeriodEnd.toISOString(),
        })
        .eq("tenant_id", tenantId);

      await supabase.from("subscription_events").insert({
        tenant_id: tenantId,
        event_type: "downgrade_scheduled",
        old_plan: currentPlan,
        new_plan: targetPlan,
        effective_at: currentPeriodEnd.toISOString(),
        stripe_subscription_id: subscription.stripe_subscription_id,
        metadata: {
          scheduled_for: currentPeriodEnd.toISOString(),
          will_create_new_subscription: true,
          target_base_devices: targetConfig.baseDevices,
        },
        created_by: userId,
      });

      result = {
        success: true,
        message: `Downgrade para ${targetPlan} agendado para ${currentPeriodEnd.toLocaleDateString('pt-BR')}`,
        effective_at: currentPeriodEnd.toISOString(),
        scheduled: true,
      };
      break;
    }

    case "cancel": {
      if (!subscription.stripe_subscription_id) {
        throw new Error("No active Stripe subscription");
      }

      const stripeSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      const cancelAt = new Date(stripeSubscription.current_period_end * 1000);

      logStep("Subscription canceled", { cancelAt: cancelAt.toISOString() });

      await supabase.from("subscription_events").insert({
        tenant_id: tenantId,
        event_type: "canceled",
        old_plan: currentPlan,
        effective_at: cancelAt.toISOString(),
        stripe_subscription_id: subscription.stripe_subscription_id,
        created_by: userId,
      });

      result = {
        success: true,
        message: `Assinatura sera cancelada em ${cancelAt.toLocaleDateString('pt-BR')}`,
        cancel_at: cancelAt.toISOString(),
      };
      break;
    }

    default:
      throw new Error(`Invalid operation: ${operation}`);
  }

  return result;
}, { methods: ['POST'] });
