/**
 * Billing Stripe Handlers — Inlined from standalone functions (Phase 2B)
 * Uses dynamic Stripe import to avoid loading SDK on non-billing requests.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

type SB = any;

/** Minimal Stripe types — avoids `any` for dynamically imported SDK */
interface StripeInvoice {
  id: string; number: string; amount_due: number; amount_paid: number;
  currency: string; status: string; created: number; due_date: number | null;
  hosted_invoice_url: string | null; invoice_pdf: string | null;
}
interface StripeSubscriptionItem {
  id: string; price: { id: string }; quantity: number;
}
interface StripeSubscription {
  id: string; status: string; trial_end: number | null;
  current_period_end: number; items: { data: StripeSubscriptionItem[] };
}
interface StripeInstance {
  invoices: { list(params: Record<string, unknown>): Promise<{ data: StripeInvoice[] }> };
  billingPortal: { sessions: { create(params: Record<string, unknown>): Promise<{ url: string }> } };
  customers: { list(params: Record<string, unknown>): Promise<{ data: Array<{ id: string }> }>; create(params: Record<string, unknown>): Promise<{ id: string }> };
  checkout: { sessions: { create(params: Record<string, unknown>): Promise<{ id: string; url: string }> } };
  subscriptions: {
    retrieve(id: string): Promise<StripeSubscription>;
    update(id: string, params: Record<string, unknown>): Promise<StripeSubscription>;
    cancel(id: string, params?: Record<string, unknown>): Promise<StripeSubscription>;
  };
}
interface StripePlanMapping { plan_type: string; stripe_price_id: string; base_devices: number }
interface TenantFeature { feature_key: string; enabled: boolean; quota_limit: number | null; quota_used: number | null }

async function getStripe(): Promise<{ stripe: StripeInstance; Stripe: unknown }> {
  const { default: Stripe } = await import('https://esm.sh/stripe@18.5.0');
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return { stripe: new Stripe(key, { apiVersion: '2025-08-27.basil' }) as StripeInstance, Stripe };
}

// ── list-invoices ───────────────────────────────────────────────────────
export async function handleListInvoices(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { invoices: [] };

  const { data: userRole } = await supabase
    .from('user_roles').select('tenant_id').eq('user_id', userId).limit(1).maybeSingle();
  if (!userRole?.tenant_id) return { invoices: [] };

  const { data: subscription } = await supabase
    .from('tenant_subscriptions').select('stripe_customer_id').eq('tenant_id', userRole.tenant_id).maybeSingle();
  if (!subscription?.stripe_customer_id) return { invoices: [] };

  const { stripe } = await getStripe();
  const invoices = await stripe.invoices.list({ customer: subscription.stripe_customer_id, limit: 12 });

  const formattedInvoices = invoices.data.map((inv: StripeInvoice) => ({
    id: inv.id, number: inv.number, amount_due: inv.amount_due, amount_paid: inv.amount_paid,
    currency: inv.currency, status: inv.status, created: inv.created, due_date: inv.due_date,
    hosted_invoice_url: inv.hosted_invoice_url, invoice_pdf: inv.invoice_pdf,
  }));

  return { invoices: formattedInvoices };
}

// ── customer-portal ─────────────────────────────────────────────────────
export async function handleCustomerPortal(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant not found', __status: 400 };

  const { data: subscription } = await supabase
    .from('tenant_subscriptions')
    .select('stripe_customer_id, status, plan_id, billing_period, current_period_end')
    .eq('tenant_id', tenantId).maybeSingle();

  if (!subscription?.stripe_customer_id) {
    const status = subscription?.status || 'unknown';
    if (status === 'trialing') return { error: 'Voce esta em periodo de avaliacao gratuita.', code: 'TRIAL_USER', trial: true };
    if (status === 'active') return { error: 'Voce esta no plano gratuito.', code: 'FREE_USER', free: true };
    return { error: 'Nenhuma assinatura ativa encontrada.', code: 'NO_SUBSCRIPTION' };
  }

  const { stripe } = await getStripe();
  const origin = ctx?.req?.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://cybershield.com.br';

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/admin/subscriptions`,
  });

  logger.info(`[CUSTOMER-PORTAL] Portal session created for ${subscription.stripe_customer_id}`);

  return {
    url: session.url,
    billing_period: subscription.billing_period || 'monthly',
    prepaid: (subscription.billing_period || 'monthly') !== 'monthly',
    current_period_end: subscription.current_period_end,
  };
}

// ── check-subscription ──────────────────────────────────────────────────
export async function handleCheckSubscription(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { subscribed: false, plan_name: 'free', status: 'inactive' };

  const logStep = (step: string, details?: Record<string, unknown>) => {
    logger.info(`[CHECK-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
  };

  logStep('Function started', { tenantId });

  const { data: subscription } = await supabase
    .from('tenant_subscriptions')
    .select(`stripe_subscription_id, stripe_customer_id, device_quantity, addon_devices, is_legacy, status, trial_end, current_period_end, plan_id, subscription_plans!inner ( name, stripe_price_id, max_devices )`)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  interface SubscriptionWithPlan {
    stripe_subscription_id: string | null; stripe_customer_id: string | null;
    device_quantity: number | null; addon_devices: number | null; is_legacy: boolean | null;
    status: string | null; trial_end: string | null; current_period_end: string | null;
    plan_id: string | null; subscription_plans: { name: string; stripe_price_id: string; max_devices: number | null } | null;
  }
  const typedSub = subscription as SubscriptionWithPlan | null;

  const getBaseDevices = (planName: string): number => {
    const map: Record<string, number> = {
      starter_compliance: 10, starter: 10, business: 30,
      scale: 100, enterprise: 1000, pro: 30, free: 2,
    };
    return map[planName] || 2;
  };

  if (!typedSub?.stripe_subscription_id) {
    const planName = typedSub?.subscription_plans?.name || 'free';
    const isLegacy = typedSub?.is_legacy || false;
    const baseDevices = getBaseDevices(planName);
    const addonDevices = typedSub?.addon_devices || 0;

    if (planName === 'enterprise' || planName === 'custom' || planName === 'pro') {
      logStep('Manual plan detected - V4', { planName, tenantId });

      const { data: features } = await supabase
        .from('tenant_features').select('feature_key, enabled, quota_limit, quota_used').eq('tenant_id', tenantId);

      const featuresMap = features?.reduce((acc: Record<string, unknown>, f: TenantFeature) => {
        acc[f.feature_key] = { enabled: f.enabled, quota_limit: f.quota_limit, quota_used: f.quota_used };
        return acc;
      }, {});

      const { count: installedAgents } = await supabase
        .from('agents').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active');

      const maxDevices = typedSub?.subscription_plans?.max_devices || (baseDevices + addonDevices);

      return {
        subscribed: true, plan_name: planName, is_legacy: isLegacy,
        base_devices: baseDevices, addon_devices: addonDevices, total_devices: baseDevices + addonDevices,
        device_quantity: typedSub?.device_quantity || 0, max_devices: maxDevices,
        installed_agents: installedAgents || 0,
        available_slots: Math.max(0, maxDevices - (installedAgents || 0)),
        status: typedSub?.status || 'active',
        trial_end: typedSub?.trial_end || null,
        current_period_end: typedSub?.current_period_end || null,
        features: featuresMap,
      };
    }

    logStep('No Stripe subscription found - Free plan');

    const { count: installedAgents } = await supabase
      .from('agents').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active');

    return {
      subscribed: false, plan_name: 'free', is_legacy: false,
      base_devices: 2, addon_devices: 0, total_devices: 2,
      device_quantity: 0, max_devices: 2,
      installed_agents: installedAgents || 0,
      available_slots: Math.max(0, 2 - (installedAgents || 0)),
      status: 'inactive',
    };
  }

  logStep('Found local subscription', { subscriptionId: typedSub.stripe_subscription_id });

  const { stripe } = await getStripe();
  const stripeSubscription = await stripe.subscriptions.retrieve(typedSub.stripe_subscription_id);
  logStep('Fetched Stripe subscription', { status: stripeSubscription.status });

  const { data: addonMappings } = await supabase
    .from('stripe_plan_mapping').select('stripe_price_id').eq('plan_type', 'addon');

  const ADDON_PRICE_IDS = addonMappings?.map((m: StripePlanMapping) => m.stripe_price_id) || [];
  let addonDevicesFromStripe = 0;
  for (const item of stripeSubscription.items.data) {
    if (ADDON_PRICE_IDS.includes(item.price.id)) {
      addonDevicesFromStripe += item.quantity || 0;
    }
  }

  const planName = typedSub.subscription_plans.name;
  const baseDevices = getBaseDevices(planName);
  const totalDevices = baseDevices + addonDevicesFromStripe;
  const isLegacy = typedSub.is_legacy || false;

  const status = stripeSubscription.status;
  const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null;
  const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

  await supabase.from('tenant_subscriptions')
    .update({ device_quantity: totalDevices, addon_devices: addonDevicesFromStripe, status, trial_end: trialEnd, current_period_end: currentPeriodEnd })
    .eq('tenant_id', tenantId);

  await supabase.rpc('ensure_tenant_features', { p_tenant_id: tenantId, p_plan_name: planName, p_device_quantity: totalDevices });

  const { data: features } = await supabase
    .from('tenant_features').select('feature_key, enabled, quota_limit, quota_used').eq('tenant_id', tenantId);

  const featuresMap = features?.reduce((acc: Record<string, unknown>, f: Record<string, unknown>) => {
    acc[f.feature_key as string] = { enabled: f.enabled, quota_limit: f.quota_limit, quota_used: f.quota_used };
    return acc;
  }, {});

  return {
    subscribed: ['active', 'trialing'].includes(status),
    plan_name: planName, is_legacy: isLegacy,
    base_devices: baseDevices, addon_devices: addonDevicesFromStripe,
    total_devices: totalDevices, device_quantity: totalDevices,
    status, trial_end: trialEnd, current_period_end: currentPeriodEnd, features: featuresMap,
  };
}

// ── create-checkout ─────────────────────────────────────────────────────
const STRIPE_PLANS: Record<string, { priceId: string; baseDevices: number; maxDevices: number }> = {
  starter_compliance: { priceId: 'price_1Sj531FeHfNScQDP8kMvWUpP', baseDevices: 10, maxDevices: 50 },
  business: { priceId: 'price_1Sj53TFeHfNScQDPyAN6B3RG', baseDevices: 30, maxDevices: 200 },
};

const ADDON_PRICES: Record<string, string> = {
  starter_compliance: 'price_1Sj53iFeHfNScQDPS7pve80k',
  business: 'price_1Sj542FeHfNScQDPpgdjaKx1',
};

const MSP_COUPONS = {
  level1: { id: '17IEYGD3', minDevices: 100 },
  level2: { id: 'uJ5hLxn9', minDevices: 300 },
  level3: { id: 'quY2WQ8h', minDevices: 1000 },
};

function getMspCouponId(totalDevices: number): string | null {
  if (totalDevices >= MSP_COUPONS.level3.minDevices) return MSP_COUPONS.level3.id;
  if (totalDevices >= MSP_COUPONS.level2.minDevices) return MSP_COUPONS.level2.id;
  if (totalDevices >= MSP_COUPONS.level1.minDevices) return MSP_COUPONS.level1.id;
  return null;
}

export async function handleCreateCheckout(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  const userId = ctx?.userId;
  if (!tenantId || !userId) return { error: 'Authentication required', __status: 401 };

  const logStep = (step: string, details?: Record<string, unknown>) => {
    logger.info(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
  };

  logStep('Function started');

  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
  if (!authUser?.email) throw new Error('User email not found');
  logStep('User email found', { email: authUser.email });

  const { z } = await import('https://esm.sh/zod@3.23.8');
  const CheckoutSchema = z.object({
    planName: z.enum(['starter_compliance', 'business']),
    extraDevices: z.number().int().min(0).max(500).default(0),
  });

  const parsed = CheckoutSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors, __status: 400 };
  const { planName, extraDevices } = parsed.data;

  const planConfig = STRIPE_PLANS[planName];
  logStep('Request parameters', { planName, extraDevices, planConfig });

  const totalDevices = planConfig.baseDevices + extraDevices;
  if (totalDevices > planConfig.maxDevices) throw new Error(`Total devices (${totalDevices}) exceeds plan maximum (${planConfig.maxDevices})`);

  const { data: existingSubscription } = await supabase
    .from('tenant_subscriptions').select('stripe_subscription_id, status')
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (existingSubscription?.stripe_subscription_id && existingSubscription?.status === 'active') {
    throw new Error('Voce ja possui uma assinatura ativa.');
  }

  const { stripe } = await getStripe();

  const customers = await stripe.customers.list({ email: authUser.email, limit: 1 });
  let customerId: string;
  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  } else {
    const customer = await stripe.customers.create({ email: authUser.email });
    customerId = customer.id;
  }

  const lineItems: Array<{ price: string; quantity: number }> = [{ price: planConfig.priceId, quantity: 1 }];
  if (extraDevices > 0) {
    lineItems.push({ price: ADDON_PRICES[planName], quantity: extraDevices });
  }

  const mspCouponId = getMspCouponId(totalDevices);
  const origin = ctx?.req?.headers.get('origin') || 'http://localhost:8080';

  const sessionParams: Record<string, unknown> = {
    customer: customerId,
    line_items: lineItems,
    mode: 'subscription',
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/admin/plan-upgrade?canceled=true`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { tenant_id: tenantId, plan_name: planName, base_devices: planConfig.baseDevices.toString(), extra_devices: extraDevices.toString(), total_devices: totalDevices.toString() },
    },
    metadata: { tenant_id: tenantId, plan_name: planName, total_devices: totalDevices.toString() },
  };

  if (mspCouponId) (sessionParams as Record<string, unknown>).discounts = [{ coupon: mspCouponId }];

  const session = await stripe.checkout.sessions.create(sessionParams);
  logStep('Checkout session created', { sessionId: session.id, url: session.url });

  return { url: session.url };
}

// ── manage-subscription ─────────────────────────────────────────────────
async function getPlanConfig(supabase: SB, planName: string): Promise<{ basePriceId: string; addonPriceId: string; baseDevices: number } | null> {
  const { data: mappings, error } = await supabase
    .from('stripe_plan_mapping').select('plan_type, stripe_price_id, base_devices').eq('logical_plan', planName);
  if (error || !mappings || mappings.length === 0) return null;
  const base = mappings.find((m: StripePlanMapping) => m.plan_type === 'base');
  const addon = mappings.find((m: StripePlanMapping) => m.plan_type === 'addon');
  if (!base || !addon) return null;
  return { basePriceId: base.stripe_price_id, addonPriceId: addon.stripe_price_id, baseDevices: base.base_devices };
}

async function getAllAddonPriceIds(supabase: SB): Promise<string[]> {
  const { data } = await supabase.from('stripe_plan_mapping').select('stripe_price_id').eq('plan_type', 'addon');
  return data?.map((m: StripePlanMapping) => m.stripe_price_id) || [];
}

export async function handleManageSubscription(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  const userId = ctx?.userId;
  if (!tenantId || !userId) return { error: 'Authentication required', __status: 401 };

  const logStep = (step: string, details?: Record<string, unknown>) => {
    logger.info(`[MANAGE-SUBSCRIPTION][${requestId}] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
  };

  const { z } = await import('https://esm.sh/zod@3.23.8');
  const ManageSubSchema = z.object({
    operation: z.enum(['upgrade', 'add_devices', 'downgrade', 'cancel']),
    target_plan: z.string().min(1).max(100).optional(),
    extra_devices: z.number().int().min(0).max(1000).default(0),
  });

  const parsed = ManageSubSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors, __status: 400 };
  const { operation, extra_devices: extraDevices } = parsed.data;
  const targetPlan = parsed.data.target_plan || '';

  logStep('Operation requested', { operation, targetPlan, extraDevices });

  const { data: subscription } = await supabase
    .from('tenant_subscriptions')
    .select(`stripe_subscription_id, stripe_customer_id, is_legacy, plan_id, device_quantity, addon_devices, current_period_end, subscription_plans!inner (name)`)
    .eq('tenant_id', tenantId).maybeSingle();

  if (!subscription) throw new Error('No subscription found for this tenant');

  const currentPlan = (subscription as Record<string, unknown> & { subscription_plans?: { name: string } }).subscription_plans?.name as string;
  const isLegacy = subscription.is_legacy || false;

  logStep('Current subscription', { currentPlan, isLegacy, subscriptionId: subscription.stripe_subscription_id });

  if (isLegacy && operation !== 'cancel') {
    return {
      error: 'LEGACY_BLOCK',
      message: 'Para expandir dispositivos ou fazer upgrade, e necessario migrar para os planos atuais.',
      requires_migration: true,
      __status: 403,
    };
  }

  const { stripe } = await getStripe();
  const allAddonPriceIds = await getAllAddonPriceIds(supabase);
  logStep('Loaded addon price IDs from DB', { count: allAddonPriceIds.length });

  let result: Record<string, unknown> = {};

  switch (operation) {
    case 'upgrade': {
      if (!subscription.stripe_subscription_id) throw new Error('No active Stripe subscription to upgrade');
      const newConfig = await getPlanConfig(supabase, targetPlan);
      if (!newConfig) throw new Error(`Invalid target plan: ${targetPlan}`);
      logStep('Target plan config', newConfig);

      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      const items: Array<{ id?: string; price: string; quantity: number }> = [];
      for (const item of stripeSub.items.data) {
        const isAddon = allAddonPriceIds.includes(item.price.id);
        items.push(isAddon
          ? { id: item.id, price: newConfig.addonPriceId, quantity: item.quantity }
          : { id: item.id, price: newConfig.basePriceId, quantity: 1 });
      }

      if (extraDevices > 0) {
        const existingAddon = stripeSub.items.data.find((item: StripeSubscriptionItem) => allAddonPriceIds.includes(item.price.id));
        if (existingAddon) {
          const addonItem = items.find(i => i.id === existingAddon.id);
          if (addonItem) addonItem.quantity = (addonItem.quantity || 0) + extraDevices;
        } else {
          items.push({ price: newConfig.addonPriceId, quantity: extraDevices });
        }
      }

      const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        items, proration_behavior: 'create_prorations',
        metadata: { plan_name: targetPlan, max_devices: String(newConfig.baseDevices + extraDevices) },
      });

      logStep('Subscription upgraded', { subscriptionId: updated.id });
      await supabase.from('subscription_events').insert({
        tenant_id: tenantId, event_type: 'upgrade', old_plan: currentPlan, new_plan: targetPlan,
        old_devices: subscription.device_quantity, new_devices: newConfig.baseDevices + extraDevices,
        addon_quantity: extraDevices, stripe_subscription_id: updated.id, created_by: userId,
      });

      result = { success: true, message: `Upgrade para ${targetPlan} realizado com sucesso`, new_plan: targetPlan, new_devices: newConfig.baseDevices + extraDevices };
      break;
    }

    case 'add_devices': {
      if (!subscription.stripe_subscription_id) throw new Error('No active Stripe subscription');
      if (extraDevices <= 0) throw new Error('Must specify positive number of extra devices');

      const planConfig = await getPlanConfig(supabase, currentPlan);
      if (!planConfig) throw new Error(`Cannot add devices to plan: ${currentPlan}`);

      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      const existingAddon = stripeSub.items.data.find((item: StripeSubscriptionItem) => item.price.id === planConfig.addonPriceId);

      const updated = existingAddon
        ? await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            items: [{ id: existingAddon.id, quantity: (existingAddon.quantity || 0) + extraDevices }],
            proration_behavior: 'create_prorations',
          })
        : await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            items: [{ price: planConfig.addonPriceId, quantity: extraDevices }],
            proration_behavior: 'create_prorations',
          });

      logStep('Devices added', { extraDevices });
      await supabase.from('subscription_events').insert({
        tenant_id: tenantId, event_type: 'addon_added',
        old_devices: subscription.device_quantity, new_devices: (subscription.device_quantity || 0) + extraDevices,
        addon_quantity: extraDevices, stripe_subscription_id: updated.id, created_by: userId,
      });

      result = { success: true, message: `${extraDevices} dispositivos adicionados com sucesso`, new_total_devices: (subscription.device_quantity || 0) + extraDevices };
      break;
    }

    case 'downgrade': {
      if (!subscription.stripe_subscription_id) throw new Error('No active Stripe subscription');
      const targetConfig = await getPlanConfig(supabase, targetPlan);
      if (!targetConfig) throw new Error(`Invalid target plan: ${targetPlan}`);

      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);

      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
        metadata: { ...stripeSub.metadata, pending_downgrade_to: targetPlan, downgrade_effective_at: currentPeriodEnd.toISOString() },
      });

      logStep('Downgrade scheduled', { targetPlan, effectiveAt: currentPeriodEnd.toISOString() });

      await supabase.from('tenant_subscriptions').update({
        pending_downgrade_to: targetPlan, pending_downgrade_at: currentPeriodEnd.toISOString(),
      }).eq('tenant_id', tenantId);

      await supabase.from('subscription_events').insert({
        tenant_id: tenantId, event_type: 'downgrade_scheduled', old_plan: currentPlan, new_plan: targetPlan,
        effective_at: currentPeriodEnd.toISOString(), stripe_subscription_id: subscription.stripe_subscription_id,
        metadata: { scheduled_for: currentPeriodEnd.toISOString(), will_create_new_subscription: true, target_base_devices: targetConfig.baseDevices },
        created_by: userId,
      });

      result = { success: true, message: `Downgrade para ${targetPlan} agendado para ${currentPeriodEnd.toLocaleDateString('pt-BR')}`, effective_at: currentPeriodEnd.toISOString(), scheduled: true };
      break;
    }

    case 'cancel': {
      if (!subscription.stripe_subscription_id) throw new Error('No active Stripe subscription');
      const stripeSub = await stripe.subscriptions.update(subscription.stripe_subscription_id, { cancel_at_period_end: true });
      const cancelAt = new Date(stripeSub.current_period_end * 1000);

      logStep('Subscription canceled', { cancelAt: cancelAt.toISOString() });
      await supabase.from('subscription_events').insert({
        tenant_id: tenantId, event_type: 'canceled', old_plan: currentPlan,
        effective_at: cancelAt.toISOString(), stripe_subscription_id: subscription.stripe_subscription_id, created_by: userId,
      });

      result = { success: true, message: `Assinatura sera cancelada em ${cancelAt.toLocaleDateString('pt-BR')}`, cancel_at: cancelAt.toISOString() };
      break;
    }

    default:
      throw new Error(`Invalid operation: ${operation}`);
  }

  return result;
}

// ── create-stripe-products ──────────────────────────────────────────────
export async function handleCreateStripeProducts(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  logger.info('[CREATE-STRIPE-PRODUCTS] Starting V4 product creation');

  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
  if (!isAdmin && !isSuperAdmin) return { error: 'Only admins can create Stripe products', __status: 403 };

  const { stripe } = await getStripe();
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
    throw new Error("STRIPE_SECRET_KEY must start with 'sk_test_' or 'sk_live_'");
  }

  const products = [
    { name: 'starter', stripeName: 'CyberShield - Starter', description: 'Ate 5 dispositivos - monitoramento basico para PMEs', price: 15000, metadata: { plan: 'starter', max_devices: '5' } },
    { name: 'pro', stripeName: 'CyberShield - Business', description: 'Ate 25 dispositivos - alertas avancados e relatorios', price: 45000, metadata: { plan: 'pro', max_devices: '25' } },
    { name: 'scale', stripeName: 'CyberShield - Scale', description: 'Ate 100 dispositivos - onboarding e SLA', price: 120000, metadata: { plan: 'scale', max_devices: '100' } },
  ];

  const createdProducts: Record<string, { product_id: string; price_id: string }> = {};

  for (const plan of products) {
    logger.info(`[CREATE-STRIPE-PRODUCTS] Creating ${plan.name} product`);
    const product = await stripe.products.create({ name: plan.stripeName, description: plan.description, metadata: plan.metadata });
    const price = await stripe.prices.create({ product: product.id, unit_amount: plan.price, currency: 'brl', recurring: { interval: 'month' } });
    await supabase.from('subscription_plans').update({ stripe_price_id: price.id }).eq('name', plan.name);
    createdProducts[plan.name] = { product_id: product.id, price_id: price.id };
    logger.info(`[CREATE-STRIPE-PRODUCTS] ${plan.name}: ${price.id}`);
  }

  const annualCoupon = await stripe.coupons.create({
    percent_off: 16.67, duration: 'forever',
    name: 'Desconto Anual - 2 meses gratis', metadata: { type: 'annual_discount' },
  });

  return { success: true, products: createdProducts, annual_coupon_id: annualCoupon.id };
}

// ── create-stripe-products-extended ─────────────────────────────────────
function calculatePrice(baseMonthly: number, months: number, discountPct: number): number {
  return Math.round((baseMonthly * months * (1 - discountPct / 100)) * 100);
}

export async function handleCreateStripeProductsExtended(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  logger.info('[CREATE-STRIPE-PRODUCTS-EXTENDED] Starting extended period price creation');

  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
  if (!isAdmin && !isSuperAdmin) return { error: 'Only admins can create Stripe products', __status: 403 };

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
    throw new Error("STRIPE_SECRET_KEY must start with 'sk_test_' or 'sk_live_'");
  }

  const { stripe } = await getStripe();

  const { data: monthlyPlans, error: plansError } = await supabase
    .from('subscription_plans').select('name, stripe_price_id').eq('billing_period', 'monthly').in('name', ['starter', 'pro', 'scale']);
  if (plansError) throw new Error(`Failed to fetch plans: ${plansError.message}`);

  const plansConfig = [
    { name: 'starter', baseMonthly: 150 },
    { name: 'pro', baseMonthly: 450 },
    { name: 'scale', baseMonthly: 1200 },
  ];

  const periods = [
    { code: '6m', months: 6, discountPct: 4 },
    { code: '12m', months: 12, discountPct: 8 },
    { code: '24m', months: 24, discountPct: 16 },
  ];

  const createdPrices: Array<{ plan: string; period: string; price_id: string; product_id: string; total_cents: number; discount_pct: number }> = [];

  for (const plan of plansConfig) {
    const monthlyPlan = monthlyPlans?.find(p => p.name === plan.name);
    let productId: string;

    if (monthlyPlan?.stripe_price_id) {
      const existingPrice = await stripe.prices.retrieve(monthlyPlan.stripe_price_id);
      productId = existingPrice.product as string;
    } else {
      const product = await stripe.products.create({
        name: `CyberShield - ${plan.name.charAt(0).toUpperCase() + plan.name.slice(1)}`,
        metadata: { plan: plan.name },
      });
      productId = product.id;
    }

    for (const period of periods) {
      const totalCents = calculatePrice(plan.baseMonthly, period.months, period.discountPct);
      const price = await stripe.prices.create({
        product: productId, unit_amount: totalCents, currency: 'brl',
        recurring: { interval: 'month', interval_count: period.months },
        metadata: { plan: plan.name, billing_period: period.code, discount_pct: String(period.discountPct), months: String(period.months) },
      });

      await supabase.from('subscription_plans').update({ stripe_price_id: price.id }).eq('name', `${plan.name}_${period.code}`);
      createdPrices.push({ plan: plan.name, period: period.code, price_id: price.id, product_id: productId, total_cents: totalCents, discount_pct: period.discountPct });
    }
  }

  logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Created ${createdPrices.length} prices`);
  return {
    success: true, created_count: createdPrices.length, prices: createdPrices,
    summary: { starter: createdPrices.filter(p => p.plan === 'starter'), pro: createdPrices.filter(p => p.plan === 'pro'), scale: createdPrices.filter(p => p.plan === 'scale') },
  };
}

// ── stripe-health-check ─────────────────────────────────────────────────
export async function handleStripeHealthCheck(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
  if (!isSuperAdmin) {
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) return { error: 'Only admins can access health check', __status: 403 };
  }

  const response = {
    overall_status: 'healthy' as 'healthy' | 'degraded' | 'down',
    checks: {
      stripe_api: { status: 'error' as string, message: 'Not checked', details: undefined as { account_name: string; country: string } | undefined },
      products_configured: { status: 'missing' as string, details: { starter: { exists: false, price_id: null as string | null }, pro: { exists: false, price_id: null as string | null } } },
      webhook_configured: { status: 'warning' as string, message: 'Cannot verify webhook configuration automatically', endpoint_url: undefined as string | undefined },
    },
    recommendations: [] as string[],
  };

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    response.checks.stripe_api = { status: 'error', message: 'STRIPE_SECRET_KEY nao esta configurado', details: undefined };
    response.overall_status = 'down';
    response.recommendations.push('Configure STRIPE_SECRET_KEY nos secrets do projeto');
  } else if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
    response.checks.stripe_api = { status: 'error', message: 'Chave invalida: deve comecar com sk_test_ ou sk_live_', details: undefined };
    response.overall_status = 'down';
  } else {
    try {
      const { stripe } = await getStripe();
      const account = await stripe.accounts.retrieve();
      response.checks.stripe_api = {
        status: 'ok', message: 'Conectado com sucesso ao Stripe',
        details: { account_name: account.business_profile?.name || account.email || 'N/A', country: account.country || 'N/A' },
      };
    } catch {
      response.checks.stripe_api = { status: 'error', message: 'Erro ao conectar com Stripe', details: undefined };
      response.overall_status = 'down';
    }
  }

  try {
    const { data: plans } = await supabase.from('subscription_plans').select('name, stripe_price_id').in('name', ['starter', 'pro']);
    const starterPlan = plans?.find(p => p.name === 'starter');
    const proPlan = plans?.find(p => p.name === 'pro');
    response.checks.products_configured.details = {
      starter: { exists: !!starterPlan?.stripe_price_id, price_id: starterPlan?.stripe_price_id || null },
      pro: { exists: !!proPlan?.stripe_price_id, price_id: proPlan?.stripe_price_id || null },
    };
    const both = !!starterPlan?.stripe_price_id && !!proPlan?.stripe_price_id;
    const hasAny = !!starterPlan?.stripe_price_id || !!proPlan?.stripe_price_id;
    response.checks.products_configured.status = both ? 'ok' : hasAny ? 'partial' : 'missing';
    if (!both) response.overall_status = 'degraded';
  } catch (err) {
    logger.warn('[stripe-health-check] products check failed', err);
  }

  response.checks.webhook_configured = {
    status: 'warning', message: 'Configure manualmente no Stripe Dashboard',
    endpoint_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-webhook`,
  };

  if (response.overall_status === 'healthy') response.recommendations.push('Sistema Stripe totalmente operacional!');

  logger.info(`[STRIPE-HEALTH-CHECK] completed: ${response.overall_status}`);
  return response;
}
