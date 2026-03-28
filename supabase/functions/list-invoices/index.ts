/**
 * List Invoices - Migrated to serveTenant middleware
 */

import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  // Get tenant
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!userRole?.tenant_id) {
    return { invoices: [] };
  }

  // Get tenant subscription
  const { data: subscription } = await supabase
    .from('tenant_subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', userRole.tenant_id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return { invoices: [] };
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const invoices = await stripe.invoices.list({
    customer: subscription.stripe_customer_id,
    limit: 12,
  });

  const formattedInvoices = invoices.data.map((inv: Record<string, unknown>) => ({
    id: inv.id,
    number: inv.number,
    amount_due: inv.amount_due,
    amount_paid: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    created: inv.created,
    due_date: inv.due_date,
    hosted_invoice_url: inv.hosted_invoice_url,
    invoice_pdf: inv.invoice_pdf,
  }));

  return { invoices: formattedInvoices };
}, {
  methods: ['GET', 'POST'],
  skipTenantValidation: true,
});
