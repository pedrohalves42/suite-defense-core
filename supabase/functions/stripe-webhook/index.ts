import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

logger.info("[STRIPE-WEBHOOK] Function initialized");

// V4: UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

// Helper to find tenant by customer_id OR by metadata.tenant_id
async function findTenantByCustomerOrMetadata(
  supabase: any,
  customerId: string,
  metadata?: Stripe.Metadata | null
): Promise<{ tenant_id: string; plan_id: string | null } | null> {
  // First try by stripe_customer_id
  const { data: tenantSub, error } = await supabase
    .from("tenant_subscriptions")
    .select("tenant_id, plan_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (tenantSub) {
    logger.info(`[STRIPE-WEBHOOK] Found tenant by customer_id: ${tenantSub.tenant_id}`);
    return tenantSub;
  }

  // Fallback: try by metadata.tenant_id (for first-time checkout)
  // V4: Validate tenant_id is a valid UUID before using
  if (metadata?.tenant_id) {
    if (!isValidUUID(metadata.tenant_id)) {
      logger.error(`[STRIPE-WEBHOOK] Invalid tenant_id format in metadata: ${metadata.tenant_id}`);
      return null;
    }
    
    logger.info(`[STRIPE-WEBHOOK] Trying fallback by metadata.tenant_id: ${metadata.tenant_id}`);
    
    const { data: tenantSubByMeta } = await supabase
      .from("tenant_subscriptions")
      .select("tenant_id, plan_id")
      .eq("tenant_id", metadata.tenant_id)
      .maybeSingle();

    if (tenantSubByMeta) {
      // Update the stripe_customer_id for future lookups
      await supabase
        .from("tenant_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("tenant_id", metadata.tenant_id);
      
      logger.info(`[STRIPE-WEBHOOK] Linked customer ${customerId} to tenant ${metadata.tenant_id}`);
      return tenantSubByMeta;
    }
  }

  logger.error(`[STRIPE-WEBHOOK] Tenant not found for customer: ${customerId}`);
  return null;
}

Deno.serve(async (request) => {
  const signature = request.headers.get("Stripe-Signature");

  if (!signature) {
    logger.error("[STRIPE-WEBHOOK] No signature header");
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await request.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      logger.error("[STRIPE-WEBHOOK] No webhook secret configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );

    logger.info(`[STRIPE-WEBHOOK] Event received: ${event.type}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    switch (event.type) {
      case "checkout.session.completed": {
        // Handle first-time checkout - link customer to tenant
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info(`[STRIPE-WEBHOOK] Checkout completed: ${session.id}`);

        const customerId = session.customer as string;
        const tenantId = session.metadata?.tenant_id;
        const planName = session.metadata?.plan_name;

        if (tenantId && customerId) {
          // Get plan ID
          const { data: plan } = await supabase
            .from("subscription_plans")
            .select("id, max_devices")
            .eq("name", planName)
            .single();

          // Update tenant subscription with customer_id and plan
          const { error: updateError } = await supabase
            .from("tenant_subscriptions")
            .update({
              stripe_customer_id: customerId,
              plan_id: plan?.id,
              status: "trialing",
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantId);

          if (updateError) {
            logger.error("[STRIPE-WEBHOOK] Error linking customer:", updateError);
          } else {
            logger.info(`[STRIPE-WEBHOOK] Linked customer ${customerId} to tenant ${tenantId}`);
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info(`[STRIPE-WEBHOOK] Processing subscription: ${subscription.id}`);

        const customerId = subscription.customer as string;
        
        // V4: Get addon price IDs from database for accurate detection
        const { data: addonMappings } = await supabase
          .from("stripe_plan_mapping")
          .select("stripe_price_id")
          .eq("plan_type", "addon");
        
        const ADDON_PRICE_IDS = addonMappings?.map((m: Record<string, unknown>) => m.stripe_price_id) || [];
        logger.info(`[STRIPE-WEBHOOK] Loaded ${ADDON_PRICE_IDS.length} addon price IDs from DB`);
        
        // V4: Process ALL line items to separate base plan from addons
        let baseDevices = 0;
        let addonDevices = 0;
        let basePriceId: string | null = null;
        
        for (const item of subscription.items.data) {
          const priceId = item.price.id;
          const quantity = item.quantity || 1;
          
          if (ADDON_PRICE_IDS.includes(priceId)) {
            // This is an addon - quantity IS the number of extra devices
            addonDevices += quantity;
            logger.info(`[STRIPE-WEBHOOK] Addon detected: ${priceId}, quantity: ${quantity}`);
          } else {
            // This is the base plan
            basePriceId = priceId;
            baseDevices = quantity; // Usually 1 for base plan
            logger.info(`[STRIPE-WEBHOOK] Base plan detected: ${priceId}, quantity: ${quantity}`);
          }
        }
        
        const totalDevices = baseDevices + addonDevices;
        logger.info(`[STRIPE-WEBHOOK] Device breakdown: base=${baseDevices}, addon=${addonDevices}, total=${totalDevices}`);

        const status = subscription.status;
        const trialEnd = subscription.trial_end 
          ? new Date(subscription.trial_end * 1000).toISOString() 
          : null;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Get metadata from subscription
        const metadata = subscription.metadata;

        // Find tenant by customer_id or metadata fallback
        const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, metadata);

        if (!tenantSub) {
          logger.error("[STRIPE-WEBHOOK] Could not find tenant for subscription");
          break;
        }

        // Update subscription with V4 fields
        const { error: updateError } = await supabase
          .from("tenant_subscriptions")
          .update({
            stripe_subscription_id: subscription.id,
            status: status,
            device_quantity: totalDevices, // Total devices
            addon_devices: addonDevices, // V4: Separate addon count
            trial_end: trialEnd,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantSub.tenant_id);

        if (updateError) {
          logger.error("[STRIPE-WEBHOOK] Error updating subscription:", updateError);
        } else {
          logger.info(`[STRIPE-WEBHOOK] Subscription updated for tenant: ${tenantSub.tenant_id}`);
          
          // Log subscription event for audit
          const eventType = event.type === "customer.subscription.created" ? "subscription_created" : "subscription_updated";
          await supabase.from("subscription_events").insert({
            tenant_id: tenantSub.tenant_id,
            event_type: eventType,
            new_devices: totalDevices,
            addon_quantity: addonDevices,
            stripe_event_id: event.id,
            stripe_subscription_id: subscription.id,
            metadata: {
              base_devices: baseDevices,
              addon_devices: addonDevices,
              base_price_id: basePriceId,
              status: status,
            },
          });
          
          // Get plan name for feature sync
          const planName = metadata?.plan_name;
          const maxDevices = metadata?.max_devices ? parseInt(metadata.max_devices) : null;

          if (planName) {
            // Sync tenant features with total devices
            await supabase.rpc("ensure_tenant_features", {
              p_tenant_id: tenantSub.tenant_id,
              p_plan_name: planName,
              p_device_quantity: maxDevices || totalDevices,
            });
          } else if (tenantSub.plan_id) {
            // Fallback: get plan from DB
            const { data: plan } = await supabase
              .from("subscription_plans")
              .select("name, max_devices")
              .eq("id", tenantSub.plan_id)
              .single();

            if (plan) {
              await supabase.rpc("ensure_tenant_features", {
                p_tenant_id: tenantSub.tenant_id,
                p_plan_name: plan.name,
                p_device_quantity: plan.max_devices || totalDevices,
              });
            }
          }
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info(`[STRIPE-WEBHOOK] Trial ending soon: ${subscription.id}`);

        const customerId = subscription.customer as string;
        const metadata = subscription.metadata;

        const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, metadata);

        if (tenantSub) {
          await supabase
            .from("system_alerts")
            .insert({
              tenant_id: tenantSub.tenant_id,
              alert_type: "trial_ending",
              severity: "medium",
              title: "Seu período de trial está acabando",
              message: "Seu trial gratuito expira em 3 dias. Atualize seu método de pagamento para continuar usando o CyberShield.",
              details: {
                subscription_id: subscription.id,
                trial_end: subscription.trial_end 
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : null,
              },
            });

          logger.info(`[STRIPE-WEBHOOK] Trial ending alert created for tenant: ${tenantSub.tenant_id}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info(`[STRIPE-WEBHOOK] Subscription deleted: ${subscription.id}`);

        const customerId = subscription.customer as string;
        const metadata = subscription.metadata;

        const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, metadata);

        if (tenantSub) {
          // V4: Check if this was a scheduled downgrade
          const { data: tenantSubscription } = await supabase
            .from("tenant_subscriptions")
            .select("pending_downgrade_to, stripe_customer_id")
            .eq("tenant_id", tenantSub.tenant_id)
            .single();
          
          const pendingDowngradeTo = tenantSubscription?.pending_downgrade_to || metadata?.pending_downgrade_to;
          
          if (pendingDowngradeTo) {
            logger.info(`[STRIPE-WEBHOOK] Processing scheduled downgrade to: ${pendingDowngradeTo}`);
            
            // V4: Get target plan config from database
            const { data: targetPlanMapping } = await supabase
              .from("stripe_plan_mapping")
              .select("stripe_price_id, base_devices")
              .eq("logical_plan", pendingDowngradeTo)
              .eq("plan_type", "base")
              .single();
            
            if (targetPlanMapping && tenantSubscription?.stripe_customer_id) {
              // Create new subscription with the downgraded plan
              const newSubscription = await stripe.subscriptions.create({
                customer: tenantSubscription.stripe_customer_id,
                items: [{ price: targetPlanMapping.stripe_price_id }],
                metadata: {
                  tenant_id: tenantSub.tenant_id,
                  plan_name: pendingDowngradeTo,
                  max_devices: String(targetPlanMapping.base_devices),
                },
              });
              
              logger.info(`[STRIPE-WEBHOOK] Created new subscription for downgrade: ${newSubscription.id}`);
              
              // Get plan ID
              const { data: plan } = await supabase
                .from("subscription_plans")
                .select("id")
                .eq("name", pendingDowngradeTo)
                .single();
              
              // Update tenant subscription
              await supabase
                .from("tenant_subscriptions")
                .update({
                  stripe_subscription_id: newSubscription.id,
                  plan_id: plan?.id,
                  device_quantity: targetPlanMapping.base_devices,
                  addon_devices: 0,
                  status: newSubscription.status,
                  pending_downgrade_to: null,
                  pending_downgrade_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("tenant_id", tenantSub.tenant_id);
              
              // Sync features with new plan
              await supabase.rpc("ensure_tenant_features", {
                p_tenant_id: tenantSub.tenant_id,
                p_plan_name: pendingDowngradeTo,
                p_device_quantity: targetPlanMapping.base_devices,
              });
              
              // Log event
              await supabase.from("subscription_events").insert({
                tenant_id: tenantSub.tenant_id,
                event_type: "downgrade_completed",
                new_plan: pendingDowngradeTo,
                new_devices: targetPlanMapping.base_devices,
                stripe_subscription_id: newSubscription.id,
                stripe_event_id: event.id,
              });
              
              logger.info(`[STRIPE-WEBHOOK] Downgrade completed for tenant: ${tenantSub.tenant_id}`);
            } else {
              logger.error(`[STRIPE-WEBHOOK] Could not find plan mapping for: ${pendingDowngradeTo}`);
            }
          } else {
            // Normal cancellation - downgrade to free
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
                  addon_devices: 0,
                  pending_downgrade_to: null,
                  pending_downgrade_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("tenant_id", tenantSub.tenant_id);

              await supabase.rpc("ensure_tenant_features", {
                p_tenant_id: tenantSub.tenant_id,
                p_plan_name: "free",
                p_device_quantity: 3,
              });

              logger.info(`[STRIPE-WEBHOOK] Downgraded to free plan: ${tenantSub.tenant_id}`);
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`[STRIPE-WEBHOOK] Payment failed for invoice: ${invoice.id}`);

        const customerId = invoice.customer as string;

        const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, null);

        if (tenantSub) {
          await supabase
            .from("tenant_subscriptions")
            .update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantSub.tenant_id);

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

          logger.info(`[STRIPE-WEBHOOK] Payment failure alert created for tenant: ${tenantSub.tenant_id}`);
        }
        break;
      }

      default:
        logger.info(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    logger.error("[STRIPE-WEBHOOK] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
