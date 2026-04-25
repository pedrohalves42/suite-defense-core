// @ts-nocheck
/**
 * stripe-webhook - Handles Stripe webhook events
 * MODULARIZED: Event handlers in event-handlers.ts
 * 
 * Auth: Deno.serve (raw body needed for Stripe signature verification)
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createTypedClient } from "../_shared/supabase-client.ts";
import { logger } from '../_shared/logger.ts';
import { withTimeout } from '../_shared/timeout.ts';
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

import { servePublic } from '../_shared/serve-public.ts';

servePublic(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, rawBody } = ctx;
  const traceId = requestId;
  const signature = req.headers.get("Stripe-Signature");
  
  if (!signature) {
    logger.error("[STRIPE-WEBHOOK] No signature header");
    return new Response("No signature", { status: 400 });
  }

  if (!rawBody) {
    logger.error("[STRIPE-WEBHOOK] No raw body available");
    return new Response("No body", { status: 400 });
  }

  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      logger.error("[STRIPE-WEBHOOK] No webhook secret configured", { traceId });
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
    logger.info(`[STRIPE-WEBHOOK] Event received: ${event.type}`, { traceId });

    const supabase = supabaseAny; // servePublic provides service_role client

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

    return { received: true };
  } catch (err) {
    logger.error(`[STRIPE-WEBHOOK] Error:`, err);
    return new Response(JSON.stringify({ error: `Webhook error: ${err instanceof Error ? err.message : 'Unknown'}`, traceId }), { status: 400 });
  }
}, {
  provideRawBody: true,
  rateLimit: {
    endpoint: 'stripe-webhook',
    maxRequests: 50,
    windowMinutes: 1
  }
});