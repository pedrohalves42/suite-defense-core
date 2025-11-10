import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    
    if (!webhookSecret) {
      logStep("ERROR: STRIPE_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      logStep("ERROR: Missing stripe-signature header");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();

    let event: Stripe.Event;
    
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook signature verified", { eventType: event.type });
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logStep("Webhook signature verification failed", { error: errMessage });
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout completed", { sessionId: session.id });

        const tenantId = session.metadata?.tenant_id;
        const planName = session.metadata?.plan_name;
        const deviceQuantity = parseInt(session.metadata?.device_quantity || "1");

        if (!tenantId || !planName) {
          logStep("Missing metadata", { tenantId, planName });
          break;
        }

        // Get plan ID
        const { data: plan } = await supabaseClient
          .from("subscription_plans")
          .select("id")
          .eq("name", planName)
          .single();

        if (!plan) {
          logStep("Plan not found", { planName });
          break;
        }

        // Update tenant subscription
        await supabaseClient
          .from("tenant_subscriptions")
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            device_quantity: deviceQuantity,
            status: "active",
            plan_id: plan.id,
          })
          .eq("tenant_id", tenantId);

        // Sync features
        await supabaseClient.rpc("ensure_tenant_features", {
          p_tenant_id: tenantId,
          p_plan_name: planName,
          p_device_quantity: deviceQuantity,
        });

        logStep("Subscription created/updated", { tenantId, planName, deviceQuantity });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription updated", { subscriptionId: subscription.id });

        const { data: existingSubscription } = await supabaseClient
          .from("tenant_subscriptions")
          .select("tenant_id, subscription_plans!inner(name)")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        type SubscriptionWithPlan = typeof existingSubscription & {
          subscription_plans: { name: string };
        };

        const typedSubscription = existingSubscription as SubscriptionWithPlan | null;

        if (!typedSubscription) {
          logStep("Subscription not found in database", { subscriptionId: subscription.id });
          break;
        }

        const quantity = subscription.items.data[0]?.quantity || 1;
        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await supabaseClient
          .from("tenant_subscriptions")
          .update({
            device_quantity: quantity,
            status: subscription.status,
            trial_end: trialEnd,
            current_period_end: currentPeriodEnd,
          })
          .eq("stripe_subscription_id", subscription.id);

        // Sync features
        await supabaseClient.rpc("ensure_tenant_features", {
          p_tenant_id: typedSubscription.tenant_id,
          p_plan_name: typedSubscription.subscription_plans.name,
          p_device_quantity: quantity,
        });

        logStep("Subscription synced", { subscriptionId: subscription.id, quantity, status: subscription.status });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted", { subscriptionId: subscription.id });

        const { data: existingSubscription } = await supabaseClient
          .from("tenant_subscriptions")
          .select("tenant_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (!existingSubscription) break;

        // Get free plan
        const { data: freePlan } = await supabaseClient
          .from("subscription_plans")
          .select("id")
          .eq("name", "free")
          .single();

        if (freePlan) {
          await supabaseClient
            .from("tenant_subscriptions")
            .update({
              plan_id: freePlan.id,
              status: "canceled",
              device_quantity: 0,
            })
            .eq("stripe_subscription_id", subscription.id);

          // Reset to free features
          await supabaseClient.rpc("ensure_tenant_features", {
            p_tenant_id: existingSubscription.tenant_id,
            p_plan_name: "free",
            p_device_quantity: 1,
          });
        }

        logStep("Subscription downgraded to free", { subscriptionId: subscription.id });
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        logStep(`Payment ${event.type === "invoice.payment_succeeded" ? "succeeded" : "failed"}`, {
          invoiceId: event.data.object.id,
        });
        break;

      default:
        logStep("Unhandled event type", { eventType: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
