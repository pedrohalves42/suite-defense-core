/**
 * Stripe webhook event handlers
 * Extraído de stripe-webhook/index.ts para modularização
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { logger } from '../_shared/logger.ts';

// V4: UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Find tenant by customer_id OR by metadata.tenant_id
 */
export async function findTenantByCustomerOrMetadata(
  supabase: SupabaseClient,
  customerId: string,
  metadata?: Stripe.Metadata | null
): Promise<{ tenant_id: string; plan_id: string | null } | null> {
  const { data: tenantSub } = await supabase
    .from("tenant_subscriptions")
    .select("tenant_id, plan_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (tenantSub) {
    logger.info(`[STRIPE-WEBHOOK] Found tenant by customer_id: ${tenantSub.tenant_id}`);
    return tenantSub;
  }

  if (metadata?.tenant_id) {
    if (!isValidUUID(metadata.tenant_id)) {
      logger.error(`[STRIPE-WEBHOOK] Invalid tenant_id format in metadata: ${metadata.tenant_id}`);
      return null;
    }

    const { data: tenantSubByMeta } = await supabase
      .from("tenant_subscriptions")
      .select("tenant_id, plan_id")
      .eq("tenant_id", metadata.tenant_id)
      .maybeSingle();

    if (tenantSubByMeta) {
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

/**
 * Handle checkout.session.completed
 */
export async function handleCheckoutCompleted(supabase: SupabaseClient, session: Stripe.Checkout.Session): Promise<void> {
  logger.info(`[STRIPE-WEBHOOK] Checkout completed: ${session.id}`);
  const customerId = session.customer as string;
  const tenantId = session.metadata?.tenant_id;
  const planName = session.metadata?.plan_name;

  if (tenantId && customerId) {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id, max_devices")
      .eq("name", planName)
      .single();

    const { error: updateError } = await supabase
      .from("tenant_subscriptions")
      .update({ stripe_customer_id: customerId, plan_id: plan?.id, status: "trialing", updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    if (updateError) logger.error("[STRIPE-WEBHOOK] Error linking customer:", updateError);
    else logger.info(`[STRIPE-WEBHOOK] Linked customer ${customerId} to tenant ${tenantId}`);
  }
}

/**
 * Handle customer.subscription.created and customer.subscription.updated
 */
export async function handleSubscriptionUpdate(supabase: SupabaseClient, subscription: Stripe.Subscription, eventId: string, eventType: string): Promise<void> {
  logger.info(`[STRIPE-WEBHOOK] Processing subscription: ${subscription.id}`);
  const customerId = subscription.customer as string;

  // V4: Get addon price IDs from database
  const { data: addonMappings } = await supabase
    .from("stripe_plan_mapping")
    .select("stripe_price_id")
    .eq("plan_type", "addon");

  const ADDON_PRICE_IDS = addonMappings?.map((m: Record<string, unknown>) => m.stripe_price_id) || [];

  let baseDevices = 0;
  let addonDevices = 0;
  let basePriceId: string | null = null;

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    const quantity = item.quantity || 1;
    if (ADDON_PRICE_IDS.includes(priceId)) {
      addonDevices += quantity;
    } else {
      basePriceId = priceId;
      baseDevices = quantity;
    }
  }

  const totalDevices = baseDevices + addonDevices;
  const status = subscription.status;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
  const metadata = subscription.metadata;

  const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, metadata);
  if (!tenantSub) {
    logger.error("[STRIPE-WEBHOOK] Could not find tenant for subscription");
    return;
  }

  const { error: updateError } = await supabase
    .from("tenant_subscriptions")
    .update({
      stripe_subscription_id: subscription.id,
      status,
      device_quantity: totalDevices,
      addon_devices: addonDevices,
      trial_end: trialEnd,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantSub.tenant_id);

  if (updateError) {
    logger.error("[STRIPE-WEBHOOK] Error updating subscription:", updateError);
    return;
  }

  logger.info(`[STRIPE-WEBHOOK] Subscription updated for tenant: ${tenantSub.tenant_id}`);

  // Audit event
  const evtType = eventType === "customer.subscription.created" ? "subscription_created" : "subscription_updated";
  await supabase.from("subscription_events").insert({
    tenant_id: tenantSub.tenant_id,
    event_type: evtType,
    new_devices: totalDevices,
    addon_quantity: addonDevices,
    stripe_event_id: eventId,
    stripe_subscription_id: subscription.id,
    metadata: { base_devices: baseDevices, addon_devices: addonDevices, base_price_id: basePriceId, status },
  });

  // Feature sync
  const planName = metadata?.plan_name;
  const maxDevices = metadata?.max_devices ? parseInt(metadata.max_devices) : null;

  if (planName) {
    await supabase.rpc("ensure_tenant_features", { p_tenant_id: tenantSub.tenant_id, p_plan_name: planName, p_device_quantity: maxDevices || totalDevices });
  } else if (tenantSub.plan_id) {
    const { data: plan } = await supabase.from("subscription_plans").select("name, max_devices").eq("id", tenantSub.plan_id).single();
    if (plan) {
      await supabase.rpc("ensure_tenant_features", { p_tenant_id: tenantSub.tenant_id, p_plan_name: plan.name, p_device_quantity: plan.max_devices || totalDevices });
    }
  }
}

/**
 * Handle customer.subscription.trial_will_end
 */
export async function handleTrialEnding(supabase: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
  logger.info(`[STRIPE-WEBHOOK] Trial ending soon: ${subscription.id}`);
  const customerId = subscription.customer as string;
  const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, subscription.metadata);

  if (tenantSub) {
    await supabase.from("system_alerts").insert({
      tenant_id: tenantSub.tenant_id,
      alert_type: "trial_ending",
      severity: "medium",
      title: "Seu periodo de trial esta acabando",
      message: "Seu trial gratuito expira em 3 dias. Atualize seu metodo de pagamento para continuar usando o CyberShield.",
      details: {
        subscription_id: subscription.id,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      },
    });
    logger.info(`[STRIPE-WEBHOOK] Trial ending alert created for tenant: ${tenantSub.tenant_id}`);
  }
}

/**
 * Handle customer.subscription.deleted
 */
export async function handleSubscriptionDeleted(supabase: any, stripe: Stripe, subscription: Stripe.Subscription, eventId: string): Promise<void> {
  logger.info(`[STRIPE-WEBHOOK] Subscription deleted: ${subscription.id}`);
  const customerId = subscription.customer as string;
  const metadata = subscription.metadata;
  const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, metadata);

  if (!tenantSub) return;

  const { data: tenantSubscription } = await supabase
    .from("tenant_subscriptions")
    .select("pending_downgrade_to, stripe_customer_id")
    .eq("tenant_id", tenantSub.tenant_id)
    .single();

  const pendingDowngradeTo = tenantSubscription?.pending_downgrade_to || metadata?.pending_downgrade_to;

  if (pendingDowngradeTo) {
    logger.info(`[STRIPE-WEBHOOK] Processing scheduled downgrade to: ${pendingDowngradeTo}`);
    const { data: targetPlanMapping } = await supabase
      .from("stripe_plan_mapping")
      .select("stripe_price_id, base_devices")
      .eq("logical_plan", pendingDowngradeTo)
      .eq("plan_type", "base")
      .single();

    if (targetPlanMapping && tenantSubscription?.stripe_customer_id) {
      const newSubscription = await stripe.subscriptions.create({
        customer: tenantSubscription.stripe_customer_id,
        items: [{ price: targetPlanMapping.stripe_price_id }],
        metadata: { tenant_id: tenantSub.tenant_id, plan_name: pendingDowngradeTo, max_devices: String(targetPlanMapping.base_devices) },
      });

      const { data: plan } = await supabase.from("subscription_plans").select("id").eq("name", pendingDowngradeTo).single();

      await supabase.from("tenant_subscriptions").update({
        stripe_subscription_id: newSubscription.id,
        plan_id: plan?.id,
        device_quantity: targetPlanMapping.base_devices,
        addon_devices: 0,
        status: newSubscription.status,
        pending_downgrade_to: null,
        pending_downgrade_at: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", tenantSub.tenant_id);

      await supabase.rpc("ensure_tenant_features", { p_tenant_id: tenantSub.tenant_id, p_plan_name: pendingDowngradeTo, p_device_quantity: targetPlanMapping.base_devices });
      await supabase.from("subscription_events").insert({ tenant_id: tenantSub.tenant_id, event_type: "downgrade_completed", new_plan: pendingDowngradeTo, new_devices: targetPlanMapping.base_devices, stripe_subscription_id: newSubscription.id, stripe_event_id: eventId });
      logger.info(`[STRIPE-WEBHOOK] Downgrade completed for tenant: ${tenantSub.tenant_id}`);
    } else {
      logger.error(`[STRIPE-WEBHOOK] Could not find plan mapping for: ${pendingDowngradeTo}`);
    }
  } else {
    // Normal cancellation - downgrade to free
    const { data: freePlan } = await supabase.from("subscription_plans").select("id").eq("name", "free").single();
    if (freePlan) {
      await supabase.from("tenant_subscriptions").update({
        plan_id: freePlan.id, status: "canceled", stripe_subscription_id: null,
        device_quantity: 0, addon_devices: 0, pending_downgrade_to: null, pending_downgrade_at: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", tenantSub.tenant_id);

      await supabase.rpc("ensure_tenant_features", { p_tenant_id: tenantSub.tenant_id, p_plan_name: "free", p_device_quantity: 3 });
      logger.info(`[STRIPE-WEBHOOK] Downgraded to free plan: ${tenantSub.tenant_id}`);
    }
  }
}

/**
 * Handle invoice.payment_failed
 */
export async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice): Promise<void> {
  logger.info(`[STRIPE-WEBHOOK] Payment failed for invoice: ${invoice.id}`);
  const customerId = invoice.customer as string;
  const tenantSub = await findTenantByCustomerOrMetadata(supabase, customerId, null);

  if (tenantSub) {
    await supabase.from("tenant_subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("tenant_id", tenantSub.tenant_id);
    await supabase.from("system_alerts").insert({
      tenant_id: tenantSub.tenant_id,
      alert_type: "payment_failed",
      severity: "high",
      title: "Falha no Pagamento",
      message: `O pagamento da fatura ${invoice.number} falhou. Por favor, atualize seu metodo de pagamento.`,
      details: { invoice_id: invoice.id, amount_due: invoice.amount_due, attempt_count: invoice.attempt_count },
    });
    logger.info(`[STRIPE-WEBHOOK] Payment failure alert created for tenant: ${tenantSub.tenant_id}`);
  }
}
