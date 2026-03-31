/**
 * create-stripe-products-extended — Migrated to serveTenant
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

function calculatePrice(baseMonthly: number, months: number, discountPct: number): number {
  const total = baseMonthly * months;
  return Math.round((total * (1 - discountPct / 100)) * 100);
}

serveTenant(async (_req, ctx) => {
  const { supabase, userId } = ctx;

  logger.info("[CREATE-STRIPE-PRODUCTS-EXTENDED] Starting extended period price creation");

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
    throw new Error("STRIPE_SECRET_KEY must be a Secret Key starting with 'sk_test_' or 'sk_live_'. Restricted keys (rk_*) are not supported.");
  }

  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId!, _role: 'admin' });
  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: userId!, _role: 'super_admin' });
  if (!isAdmin && !isSuperAdmin) throw new Error("Only admins can create Stripe products");

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const { data: monthlyPlans, error: plansError } = await supabase
    .from("subscription_plans").select("name, stripe_price_id")
    .eq("billing_period", "monthly").in("name", ["starter", "pro", "scale"]);
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
        product: productId, unit_amount: totalCents, currency: "brl",
        recurring: { interval: "month", interval_count: period.months },
        metadata: { plan: plan.name, billing_period: period.code, discount_pct: String(period.discountPct), months: String(period.months) },
      });

      const fullPlanName = `${plan.name}_${period.code}`;
      await supabase.from("subscription_plans").update({ stripe_price_id: price.id }).eq("name", fullPlanName);
      createdPrices.push({ plan: plan.name, period: period.code, price_id: price.id, product_id: productId, total_cents: totalCents, discount_pct: period.discountPct });
    }
  }

  logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Created ${createdPrices.length} prices successfully`);
  return {
    success: true, created_count: createdPrices.length, prices: createdPrices,
    summary: { starter: createdPrices.filter(p => p.plan === 'starter'), pro: createdPrices.filter(p => p.plan === 'pro'), scale: createdPrices.filter(p => p.plan === 'scale') },
  };
});
