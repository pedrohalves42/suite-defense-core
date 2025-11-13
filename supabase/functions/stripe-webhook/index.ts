import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

console.log("[STRIPE-WEBHOOK] Function initialized");

Deno.serve(async (request) => {
  const signature = request.headers.get("Stripe-Signature");

  if (!signature) {
    console.error("[STRIPE-WEBHOOK] No signature header");
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await request.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[STRIPE-WEBHOOK] No webhook secret configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );

    console.log(`[STRIPE-WEBHOOK] Event received: ${event.type}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[STRIPE-WEBHOOK] Processing subscription: ${subscription.id}`);

        const customerId = subscription.customer as string;
        const quantity = subscription.items.data[0]?.quantity || 1;
        const status = subscription.status;
        const trialEnd = subscription.trial_end 
          ? new Date(subscription.trial_end * 1000).toISOString() 
          : null;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Find tenant by stripe_customer_id
        const { data: tenantSub, error: findError } = await supabase
          .from("tenant_subscriptions")
          .select("tenant_id, plan_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (findError || !tenantSub) {
          console.error("[STRIPE-WEBHOOK] Tenant not found for customer:", customerId);
          break;
        }

        // Update subscription
        const { error: updateError } = await supabase
          .from("tenant_subscriptions")
          .update({
            stripe_subscription_id: subscription.id,
            status: status,
            device_quantity: quantity,
            trial_end: trialEnd,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantSub.tenant_id);

        if (updateError) {
          console.error("[STRIPE-WEBHOOK] Error updating subscription:", updateError);
        } else {
          console.log(`[STRIPE-WEBHOOK] Subscription updated for tenant: ${tenantSub.tenant_id}`);
          
          // Get plan name for feature sync
          const { data: plan } = await supabase
            .from("subscription_plans")
            .select("name")
            .eq("id", tenantSub.plan_id)
            .single();

          if (plan) {
            // Sync tenant features
            await supabase.rpc("ensure_tenant_features", {
              p_tenant_id: tenantSub.tenant_id,
              p_plan_name: plan.name,
              p_device_quantity: quantity,
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[STRIPE-WEBHOOK] Subscription deleted: ${subscription.id}`);

        const customerId = subscription.customer as string;

        // Find and update to free plan
        const { data: tenantSub } = await supabase
          .from("tenant_subscriptions")
          .select("tenant_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (tenantSub) {
          // Get free plan
          const { data: freePlan } = await supabase
            .from("subscription_plans")
            .select("id")
            .eq("name", "free")
            .single();

          if (freePlan) {
            await supabase
              .from("tenant_subscriptions")
              .update({
                plan_id: freePlan.id,
                status: "canceled",
                stripe_subscription_id: null,
                device_quantity: 0,
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", tenantSub.tenant_id);

            // Reset features to free tier
            await supabase.rpc("ensure_tenant_features", {
              p_tenant_id: tenantSub.tenant_id,
              p_plan_name: "free",
              p_device_quantity: 0,
            });

            console.log(`[STRIPE-WEBHOOK] Downgraded to free plan: ${tenantSub.tenant_id}`);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[STRIPE-WEBHOOK] Payment failed for invoice: ${invoice.id}`);

        const customerId = invoice.customer as string;

        // Find tenant and update status
        const { data: tenantSub } = await supabase
          .from("tenant_subscriptions")
          .select("tenant_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (tenantSub) {
          await supabase
            .from("tenant_subscriptions")
            .update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantSub.tenant_id);

          // Create system alert
          await supabase
            .from("system_alerts")
            .insert({
              tenant_id: tenantSub.tenant_id,
              alert_type: "payment_failed",
              severity: "high",
              title: "Falha no Pagamento",
              message: `O pagamento da fatura ${invoice.number} falhou. Por favor, atualize seu método de pagamento.`,
              details: {
                invoice_id: invoice.id,
                amount_due: invoice.amount_due,
                attempt_count: invoice.attempt_count,
              },
            });

          console.log(`[STRIPE-WEBHOOK] Payment failure alert created for tenant: ${tenantSub.tenant_id}`);
        }
        break;
      }

      default:
        console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[STRIPE-WEBHOOK] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
