/**
 * stripe-webhook - Handles Stripe webhook events
 * MODULARIZED: Event handlers in event-handlers.ts
 * 
 * Auth: Deno.serve (raw body needed for Stripe signature verification)
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdate,
  handleTrialEnding,
  handleSubscriptionDeleted,
  handlePaymentFailed,
} from './event-handlers.ts';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

logger.info("[STRIPE-WEBHOOK] Function initialized");

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

    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
    logger.info(`[STRIPE-WEBHOOK] Event received: ${event.type}`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(supabase, event.data.object as Stripe.Subscription, event.id, event.type);
        break;
      case "customer.subscription.trial_will_end":
        await handleTrialEnding(supabase, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, stripe, event.data.object as Stripe.Subscription, event.id);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice);
        break;
      default:
        logger.info(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
  } catch (err) {
    logger.error("[STRIPE-WEBHOOK] Error:", err);
    return new Response(JSON.stringify({ error: `Webhook error: ${err instanceof Error ? err.message : 'Unknown'}` }), { status: 400 });
  }
});
