import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CREATE-STRIPE-PRODUCTS] Starting product creation");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

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

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roleData?.role !== "admin") throw new Error("Only admins can create Stripe products");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Create Starter Product
    console.log("[CREATE-STRIPE-PRODUCTS] Creating Starter product");
    const starterProduct = await stripe.products.create({
      name: "CyberShield Starter",
      description: "Proteção avançada para até 30 dispositivos",
    });

    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 3000, // R$ 30.00
      currency: "brl",
      recurring: { interval: "month", trial_period_days: 30 },
    });

    // Create Pro Product
    console.log("[CREATE-STRIPE-PRODUCTS] Creating Pro product");
    const proProduct = await stripe.products.create({
      name: "CyberShield Pro",
      description: "Proteção completa para até 200 dispositivos",
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 5000, // R$ 50.00
      currency: "brl",
      recurring: { interval: "month", trial_period_days: 30 },
    });

    // Update database with price IDs
    console.log("[CREATE-STRIPE-PRODUCTS] Updating database with price IDs");
    await supabaseClient
      .from("subscription_plans")
      .update({ stripe_price_id: starterPrice.id })
      .eq("name", "starter");

    await supabaseClient
      .from("subscription_plans")
      .update({ stripe_price_id: proPrice.id })
      .eq("name", "pro");

    console.log("[CREATE-STRIPE-PRODUCTS] Products created successfully");

    return new Response(
      JSON.stringify({
        success: true,
        products: {
          starter: {
            product_id: starterProduct.id,
            price_id: starterPrice.id,
          },
          pro: {
            product_id: proProduct.id,
            price_id: proPrice.id,
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-STRIPE-PRODUCTS] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
