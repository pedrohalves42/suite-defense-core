import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Dual-auth - accept Internal Secret OR valid JWT (ADR-023 compliant)
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');
  const authHeader = req.headers.get('Authorization');

  const isInternalAuth = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET;
  const isJwtAuth = authHeader?.startsWith('Bearer ') && authHeader.length > 10;

  if (!isInternalAuth && !isJwtAuth) {
    logger.warn("[SYNC-STRIPE-SUBSCRIPTIONS] Unauthorized access attempt");
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
    );
  }

  logger.info(`[SYNC-STRIPE-SUBSCRIPTIONS] Authorized via ${isInternalAuth ? 'internal-secret' : 'jwt'}`);

  try {
    logger.info("[SYNC-STRIPE-SUBSCRIPTIONS] Starting sync");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get all subscriptions with Stripe IDs
    const { data: subscriptions, error } = await supabaseClient
      .from("tenant_subscriptions")
      .select(`
        tenant_id,
        stripe_subscription_id,
        status,
        subscription_plans!inner(name)
      `)
      .not("stripe_subscription_id", "is", null);

    if (error) throw error;

    let syncedCount = 0;
    let errorCount = 0;

    const typedSubscriptions = (subscriptions || []).map((sub: any) => ({
      tenant_id: sub.tenant_id,
      stripe_subscription_id: sub.stripe_subscription_id,
      status: sub.status,
      plan_name: sub.subscription_plans?.name || "free",
    }));

    for (const sub of typedSubscriptions) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        
        const quantity = stripeSubscription.items.data[0]?.quantity || 1;
        const status = stripeSubscription.status;
        const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null;
        const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

        // Update if different
        if (sub.status !== status) {
          await supabaseClient
            .from("tenant_subscriptions")
            .update({
              device_quantity: quantity,
              status: status,
              trial_end: trialEnd,
              current_period_end: currentPeriodEnd,
            })
            .eq("tenant_id", sub.tenant_id);

          // Sync features
          await supabaseClient.rpc("ensure_tenant_features", {
            p_tenant_id: sub.tenant_id,
            p_plan_name: sub.plan_name,
            p_device_quantity: quantity,
          });

          logger.info(`[SYNC-STRIPE-SUBSCRIPTIONS] Synced ${sub.tenant_id}: ${sub.status} -> ${status}`);
          syncedCount++;
        }
      } catch (err) {
        logger.error(`[SYNC-STRIPE-SUBSCRIPTIONS] Error syncing ${sub.tenant_id}:`, err);
        errorCount++;
      }
    }

    logger.info(`[SYNC-STRIPE-SUBSCRIPTIONS] Sync complete: ${syncedCount} synced, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ success: true, synced: syncedCount, errors: errorCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[SYNC-STRIPE-SUBSCRIPTIONS] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
