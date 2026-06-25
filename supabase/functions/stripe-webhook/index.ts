/**
 * stripe-webhook - Handles Stripe webhook events
 * MODULARIZED: Event handlers in event-handlers.ts
 *
 * Auth: servePublic (raw body needed for Stripe signature verification)
 *
 * D9-C: Tipagem estrita sem alterar runtime, assinatura ou idempotência.
 * - Raw body é lido por servePublic (provideRawBody: true) e validado ANTES
 *   de qualquer parse JSON aplicado ao evento.
 * - constructEventAsync preserva a verificação HMAC do Stripe.
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { createTypedClient } from "../_shared/supabase-client.ts";
import type { Database } from "../_shared/database.types.ts";
import { logger } from '../_shared/logger.ts';
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdate,
  handleTrialEnding,
  handleSubscriptionDeleted,
  handlePaymentFailed,
} from './event-handlers.ts';
import { servePublic } from '../_shared/serve-public.ts';

// Silence unused import warning while preserving the typed factory for future use.
void createTypedClient;

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

logger.info("[STRIPE-WEBHOOK] Function initialized");

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

    // ⚠️ CRÍTICO: rawBody (string) é OBRIGATÓRIO para a verificação HMAC do Stripe.
    // Não substituir por req.json() — quebra a assinatura.
    const event: Stripe.Event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
    logger.info(`[STRIPE-WEBHOOK] Event received: ${event.type}`, { traceId, eventId: event.id });

    const supabase = supabaseAny as SupabaseClient<Database>;

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
        logger.info(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`, { traceId, eventId: event.id });
    }

    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown';
    logger.error(`[STRIPE-WEBHOOK] Error:`, err);
    return new Response(
      JSON.stringify({ error: `Webhook error: ${message}`, traceId }),
      { status: 400 },
    );
  }
}, {
  provideRawBody: true,
  rateLimit: {
    endpoint: 'stripe-webhook',
    maxRequests: 50,
    windowMinutes: 1,
  },
});
