import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';



// Calculate price with discount in centavos
function calculatePrice(baseMonthly: number, months: number, discountPct: number): number {
  const total = baseMonthly * months;
  return Math.round((total * (1 - discountPct / 100)) * 100); // centavos
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    logger.info("[CREATE-STRIPE-PRODUCTS-EXTENDED] Starting extended period price creation");

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

    // Get existing monthly plans to find their Stripe product IDs
    const { data: monthlyPlans, error: plansError } = await supabaseClient
      .from("subscription_plans")
      .select("name, stripe_price_id")
      .eq("billing_period", "monthly")
      .in("name", ["starter", "pro", "scale"]);

    if (plansError) throw new Error(`Failed to fetch plans: ${plansError.message}`);

    // Plans configuration with base monthly prices (in BRL)
    const plansConfig = [
      { name: 'starter', baseMonthly: 150 },
      { name: 'pro', baseMonthly: 450 },
      { name: 'scale', baseMonthly: 1200 }
    ];

    // Extended periods with discounts
    const periods = [
      { code: '6m', months: 6, discountPct: 4 },
      { code: '12m', months: 12, discountPct: 8 },
      { code: '24m', months: 24, discountPct: 16 }
    ];

    const createdPrices: Array<{
      plan: string;
      period: string;
      price_id: string;
      product_id: string;
      total_cents: number;
      discount_pct: number;
    }> = [];

    for (const plan of plansConfig) {
      // Get the existing product ID from monthly price
      const monthlyPlan = monthlyPlans?.find(p => p.name === plan.name);
      
      let productId: string;
      
      if (monthlyPlan?.stripe_price_id) {
        // Get product ID from existing price
        const existingPrice = await stripe.prices.retrieve(monthlyPlan.stripe_price_id);
        productId = existingPrice.product as string;
        logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Using existing product ${productId} for ${plan.name}`);
      } else {
        // Create new product if none exists
        const product = await stripe.products.create({
          name: `CyberShield - ${plan.name.charAt(0).toUpperCase() + plan.name.slice(1)}`,
          metadata: { plan: plan.name }
        });
        productId = product.id;
        logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Created new product ${productId} for ${plan.name}`);
      }

      // Create prices for each extended period
      for (const period of periods) {
        const totalCents = calculatePrice(plan.baseMonthly, period.months, period.discountPct);
        
        logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Creating ${plan.name} ${period.code}: R$${(totalCents/100).toFixed(2)} (${period.discountPct}% off)`);

        // Create price with interval_count for multi-month billing
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: totalCents,
          currency: "brl",
          recurring: { 
            interval: "month",
            interval_count: period.months
          },
          metadata: {
            plan: plan.name,
            billing_period: period.code,
            discount_pct: String(period.discountPct),
            months: String(period.months)
          }
        });

        // Update database with price ID - use full plan name (e.g., starter_6m)
        const fullPlanName = `${plan.name}_${period.code}`;
        const { error: updateError } = await supabaseClient
          .from("subscription_plans")
          .update({ stripe_price_id: price.id })
          .eq("name", fullPlanName);

        if (updateError) {
          logger.error(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Failed to update ${plan.name} ${period.code}: ${updateError.message}`);
        } else {
          logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Updated DB: ${plan.name} ${period.code} = ${price.id}`);
        }

        createdPrices.push({
          plan: plan.name,
          period: period.code,
          price_id: price.id,
          product_id: productId,
          total_cents: totalCents,
          discount_pct: period.discountPct
        });
      }
    }

    logger.info(`[CREATE-STRIPE-PRODUCTS-EXTENDED] Created ${createdPrices.length} prices successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        created_count: createdPrices.length,
        prices: createdPrices,
        summary: {
          starter: createdPrices.filter(p => p.plan === 'starter'),
          pro: createdPrices.filter(p => p.plan === 'pro'),
          scale: createdPrices.filter(p => p.plan === 'scale')
        }
      }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[CREATE-STRIPE-PRODUCTS-EXTENDED] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
