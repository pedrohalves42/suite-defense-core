import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    logger.info("[CREATE-STRIPE-PRODUCTS] Starting V4 product creation");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
      throw new Error(
        "STRIPE_SECRET_KEY must be a Secret Key starting with 'sk_test_' or 'sk_live_'. " +
        "Restricted keys (rk_*) are not supported."
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Check for admin OR super_admin role
    const { data: isAdmin } = await supabaseClient.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin'
    });
    
    const { data: isSuperAdmin } = await supabaseClient.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'super_admin'
    });

    if (!isAdmin && !isSuperAdmin) {
      throw new Error("Only admins can create Stripe products");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // V4 Pricing: Fixed price per plan (not per device)
    const products = [
      {
        name: 'starter',
        stripeName: 'CyberShield - Starter',
        description: 'Ate 5 dispositivos - monitoramento basico para PMEs',
        price: 15000, // R$ 150,00
        metadata: { plan: 'starter', max_devices: '5' }
      },
      {
        name: 'pro',
        stripeName: 'CyberShield - Business',
        description: 'Ate 25 dispositivos - alertas avancados e relatorios',
        price: 45000, // R$ 450,00
        metadata: { plan: 'pro', max_devices: '25' }
      },
      {
        name: 'scale',
        stripeName: 'CyberShield - Scale',
        description: 'Ate 100 dispositivos - onboarding e SLA',
        price: 120000, // R$ 1.200,00
        metadata: { plan: 'scale', max_devices: '100' }
      }
    ];

    const createdProducts: Record<string, { product_id: string; price_id: string }> = {};

    for (const plan of products) {
      logger.info(`[CREATE-STRIPE-PRODUCTS] Creating ${plan.name} product`);
      
      const product = await stripe.products.create({
        name: plan.stripeName,
        description: plan.description,
        metadata: plan.metadata
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price,
        currency: "brl",
        recurring: { interval: "month" },
      });

      // Update database with price ID
      await supabaseClient
        .from("subscription_plans")
        .update({ stripe_price_id: price.id })
        .eq("name", plan.name);

      createdProducts[plan.name] = {
        product_id: product.id,
        price_id: price.id,
      };

      logger.info(`[CREATE-STRIPE-PRODUCTS] ${plan.name}: ${price.id}`);
    }

    // Create annual discount coupon (2 months free = 16.67%)
    logger.info("[CREATE-STRIPE-PRODUCTS] Creating annual discount coupon");
    const annualCoupon = await stripe.coupons.create({
      percent_off: 16.67,
      duration: 'forever',
      name: 'Desconto Anual - 2 meses gratis',
      metadata: { type: 'annual_discount' }
    });

    logger.info("[CREATE-STRIPE-PRODUCTS] All products created successfully");

    return new Response(
      JSON.stringify({
        success: true,
        products: createdProducts,
        annual_coupon_id: annualCoupon.id,
      }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[CREATE-STRIPE-PRODUCTS] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
