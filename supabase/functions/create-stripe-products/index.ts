/**
 * create-stripe-products — Migrated to serveTenant
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  logger.info("[CREATE-STRIPE-PRODUCTS] Starting V4 product creation");

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

  if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
    throw new Error("STRIPE_SECRET_KEY must be a Secret Key starting with 'sk_test_' or 'sk_live_'. Restricted keys (rk_*) are not supported.");
  }

  // Check for admin OR super_admin role
  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId!, _role: 'admin' });
  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: userId!, _role: 'super_admin' });
  if (!isAdmin && !isSuperAdmin) throw new Error("Only admins can create Stripe products");

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const products = [
    { name: 'starter', stripeName: 'CyberShield - Starter', description: 'Ate 5 dispositivos - monitoramento basico para PMEs', price: 15000, metadata: { plan: 'starter', max_devices: '5' } },
    { name: 'pro', stripeName: 'CyberShield - Business', description: 'Ate 25 dispositivos - alertas avancados e relatorios', price: 45000, metadata: { plan: 'pro', max_devices: '25' } },
    { name: 'scale', stripeName: 'CyberShield - Scale', description: 'Ate 100 dispositivos - onboarding e SLA', price: 120000, metadata: { plan: 'scale', max_devices: '100' } },
  ];

  const createdProducts: Record<string, { product_id: string; price_id: string }> = {};

  for (const plan of products) {
    logger.info(`[CREATE-STRIPE-PRODUCTS] Creating ${plan.name} product`);
    const product = await stripe.products.create({ name: plan.stripeName, description: plan.description, metadata: plan.metadata });
    const price = await stripe.prices.create({ product: product.id, unit_amount: plan.price, currency: "brl", recurring: { interval: "month" } });
    await supabase.from("subscription_plans").update({ stripe_price_id: price.id }).eq("name", plan.name);
    createdProducts[plan.name] = { product_id: product.id, price_id: price.id };
    logger.info(`[CREATE-STRIPE-PRODUCTS] ${plan.name}: ${price.id}`);
  }

  // Create annual discount coupon
  logger.info("[CREATE-STRIPE-PRODUCTS] Creating annual discount coupon");
  const annualCoupon = await stripe.coupons.create({
    percent_off: 16.67, duration: 'forever',
    name: 'Desconto Anual - 2 meses gratis', metadata: { type: 'annual_discount' },
  });

  logger.info("[CREATE-STRIPE-PRODUCTS] All products created successfully");
  return { success: true, products: createdProducts, annual_coupon_id: annualCoupon.id };
});
