/**
 * create-checkout - Stripe Checkout session for subscription upgrade
 * V5: Migrated to serveTenant middleware
 */
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const CheckoutBodySchema = z.object({
  priceId: z.string().min(1),
  tenantId: z.string().uuid(),
});

type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

serveTenant<CheckoutBody>(async (req, ctx) => {
  // Validate input
  const parsed = CheckoutBodySchema.safeParse(ctx.body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'priceId and tenantId are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { priceId, tenantId } = parsed.data;

  // Get user email for Stripe
  const { data: { user }, error: userErr } = await ctx.supabase.auth.admin.getUserById(ctx.userId!);
  if (userErr || !user?.email) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolve plan_name and base_devices from stripe_plan_mapping
  const { data: planMapping } = await ctx.supabase
    .from('stripe_plan_mapping')
    .select('logical_plan, base_devices')
    .eq('stripe_price_id', priceId)
    .eq('plan_type', 'base')
    .maybeSingle();

  const planName = planMapping?.logical_plan || 'unknown';
  const maxDevices = planMapping?.base_devices || 10;

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2025-08-27.basil',
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 10_000,
  });

  // Check if customer exists
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  let customerId: string | undefined;
  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  }

  const origin = req.headers.get('origin') || '';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    customer_email: customerId ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${origin}/admin/subscription?success=true`,
    cancel_url: `${origin}/admin/subscription?canceled=true`,
    metadata: {
      tenant_id: tenantId,
      user_id: user.id,
      plan_name: planName,
      max_devices: String(maxDevices),
    },
  });

  logger.info('[CREATE-CHECKOUT] Session created', { sessionId: session.id, tenantId, planName });

  return { url: session.url };
}, {
  methods: ['POST'],
  rateLimit: { endpoint: 'create-checkout', maxRequests: 5, windowMinutes: 1 },
});
