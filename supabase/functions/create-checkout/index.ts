/**
 * create-checkout - Stripe Checkout session for subscription upgrade
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();

  try {
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { priceId, tenantId } = body;
    if (!priceId || !tenantId) {
      return new Response(JSON.stringify({ error: 'priceId and tenantId are required' }), {
        status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/admin/subscription?success=true`,
      cancel_url: `${origin}/admin/subscription?canceled=true`,
      metadata: { tenant_id: tenantId, user_id: user.id },
    });

    logger.info('[CREATE-CHECKOUT] Session created', { sessionId: session.id, tenantId });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CREATE-CHECKOUT] Error', { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
