import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getTenantIdForUser } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MANAGE-SUBSCRIPTION] ${step}${detailsStr}`);
};

// V4 Plan configurations
const PLAN_CONFIG = {
  starter_compliance: {
    basePriceId: 'price_1Sj531CfJUj9L8duz05lUe8H',
    addonPriceId: 'price_1Sj53iCfJUj9L8duCCU8qSN2',
    baseDevices: 10,
  },
  business: {
    basePriceId: 'price_1Sj53TCfJUj9L8duQ40uRncf',
    addonPriceId: 'price_1Sj542CfJUj9L8duKIjH3eOk',
    baseDevices: 30,
  },
} as const;

type Operation = 'upgrade' | 'add_devices' | 'downgrade' | 'cancel';
type PlanName = keyof typeof PLAN_CONFIG;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: userData.user.id });

    const tenantId = await getTenantIdForUser(supabase, userData.user.id);
    if (!tenantId) throw new Error("Tenant not found");
    logStep("Tenant found", { tenantId });

    const body = await req.json();
    const operation: Operation = body.operation;
    const targetPlan: PlanName = body.target_plan;
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

    const currentPlan = (subscription as any).subscription_plans?.name;
    const isLegacy = subscription.is_legacy || false;

    logStep("Current subscription", { currentPlan, isLegacy, subscriptionId: subscription.stripe_subscription_id });

    // V4: Block addon purchases for legacy customers
    if (isLegacy && operation !== 'cancel') {
      logStep("Legacy customer blocked", { operation });
      return new Response(
        JSON.stringify({
          error: "LEGACY_BLOCK",
          message: "Para expandir dispositivos ou fazer upgrade, é necessário migrar para os planos atuais.",
          requires_migration: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let result: any = {};

    switch (operation) {
      case "upgrade": {
        if (!subscription.stripe_subscription_id) {
          throw new Error("No active Stripe subscription to upgrade");
        }

        if (!PLAN_CONFIG[targetPlan]) {
          throw new Error(`Invalid target plan: ${targetPlan}`);
        }

        const newConfig = PLAN_CONFIG[targetPlan];
        
        // Get current subscription from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        
        // Build new items array - replace base plan, keep/update addons
        const items: Stripe.SubscriptionUpdateParams.Item[] = [];
        
        // Mark current base item for replacement
        for (const item of stripeSubscription.items.data) {
          const isAddon = Object.values(PLAN_CONFIG).some(c => c.addonPriceId === item.price.id);
          if (!isAddon) {
            // Replace base plan
            items.push({
              id: item.id,
              price: newConfig.basePriceId,
              quantity: 1,
            });
          } else {
            // Keep addon with new price if upgrading
            items.push({
              id: item.id,
              price: newConfig.addonPriceId,
              quantity: item.quantity,
            });
          }
        }
        
        // Add extra devices if requested
        if (extraDevices > 0) {
          const existingAddon = stripeSubscription.items.data.find(
            (item: Stripe.SubscriptionItem) => Object.values(PLAN_CONFIG).some(c => c.addonPriceId === item.price.id)
          );
          
          if (existingAddon) {
            // Update existing addon quantity
            const addonItem = items.find(i => i.id === existingAddon.id);
            if (addonItem) {
              addonItem.quantity = (addonItem.quantity || 0) + extraDevices;
            }
          } else {
            // Add new addon item
            items.push({
              price: newConfig.addonPriceId,
              quantity: extraDevices,
            });
          }
        }

        // Update subscription
        const updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          items,
          proration_behavior: 'create_prorations',
          metadata: {
            plan_name: targetPlan,
            max_devices: String(newConfig.baseDevices + extraDevices),
          },
        });

        logStep("Subscription upgraded", { subscriptionId: updatedSubscription.id });

        // Log event
        await supabase.from("subscription_events").insert({
          tenant_id: tenantId,
          event_type: "upgrade",
          old_plan: currentPlan,
          new_plan: targetPlan,
          old_devices: subscription.device_quantity,
          new_devices: newConfig.baseDevices + extraDevices,
          addon_quantity: extraDevices,
          stripe_subscription_id: updatedSubscription.id,
          created_by: userData.user.id,
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

        // Determine addon price based on current plan
        const planConfig = PLAN_CONFIG[currentPlan as PlanName];
        if (!planConfig) {
          throw new Error(`Cannot add devices to plan: ${currentPlan}`);
        }

        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        
        // Find existing addon item
        const existingAddon = stripeSubscription.items.data.find(
          (item: Stripe.SubscriptionItem) => item.price.id === planConfig.addonPriceId
        );

        let updatedSubscription;
        if (existingAddon) {
          // Update quantity
          updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            items: [{
              id: existingAddon.id,
              quantity: (existingAddon.quantity || 0) + extraDevices,
            }],
            proration_behavior: 'create_prorations',
          });
        } else {
          // Add new addon item
          updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            items: [{
              price: planConfig.addonPriceId,
              quantity: extraDevices,
            }],
            proration_behavior: 'create_prorations',
          });
        }

        logStep("Devices added", { extraDevices });

        // Log event
        await supabase.from("subscription_events").insert({
          tenant_id: tenantId,
          event_type: "addon_added",
          old_devices: subscription.device_quantity,
          new_devices: (subscription.device_quantity || 0) + extraDevices,
          addon_quantity: extraDevices,
          stripe_subscription_id: updatedSubscription.id,
          created_by: userData.user.id,
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

        if (!PLAN_CONFIG[targetPlan]) {
          throw new Error(`Invalid target plan: ${targetPlan}`);
        }

        // V4: Downgrade is ALWAYS scheduled for next billing cycle
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);

        // Cancel at period end
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        logStep("Downgrade scheduled", { targetPlan, effectiveAt: currentPeriodEnd.toISOString() });

        // Log event with scheduled date
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
          },
          created_by: userData.user.id,
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

        // Cancel at period end
        const stripeSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        const cancelAt = new Date(stripeSubscription.current_period_end * 1000);

        logStep("Subscription canceled", { cancelAt: cancelAt.toISOString() });

        // Log event
        await supabase.from("subscription_events").insert({
          tenant_id: tenantId,
          event_type: "canceled",
          old_plan: currentPlan,
          effective_at: cancelAt.toISOString(),
          stripe_subscription_id: subscription.stripe_subscription_id,
          created_by: userData.user.id,
        });

        result = {
          success: true,
          message: `Assinatura será cancelada em ${cancelAt.toLocaleDateString('pt-BR')}`,
          cancel_at: cancelAt.toISOString(),
        };
        break;
      }

      default:
        throw new Error(`Invalid operation: ${operation}`);
    }

    return new Response(
      JSON.stringify(result),
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
