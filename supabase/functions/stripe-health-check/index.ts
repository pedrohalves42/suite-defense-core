/**
 * stripe-health-check — Migrated to serveTenant
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface HealthCheckResponse {
  overall_status: 'healthy' | 'degraded' | 'down';
  checks: {
    stripe_api: { status: 'ok' | 'error'; message: string; details?: { account_name: string; country: string } };
    products_configured: { status: 'ok' | 'partial' | 'missing'; details: { starter: { exists: boolean; price_id: string | null }; pro: { exists: boolean; price_id: string | null } } };
    webhook_configured: { status: 'ok' | 'warning' | 'missing'; message: string; endpoint_url?: string };
  };
  recommendations: string[];
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  logger.info(`[STRIPE-HEALTH-CHECK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serveTenant(async (_req, ctx) => {
  const { supabase, userId } = ctx;

  logStep("Function started");

  // Check admin role
  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: userId!, _role: 'super_admin' });
  if (!isSuperAdmin) {
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId!, _role: 'admin' });
    if (!isAdmin) throw new Error("Only admins can access health check");
  }

  const response: HealthCheckResponse = {
    overall_status: 'healthy',
    checks: {
      stripe_api: { status: 'error', message: 'Not checked' },
      products_configured: { status: 'missing', details: { starter: { exists: false, price_id: null }, pro: { exists: false, price_id: null } } },
      webhook_configured: { status: 'warning', message: 'Cannot verify webhook configuration automatically' },
    },
    recommendations: [],
  };

  // Check 1: Stripe API
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    response.checks.stripe_api = { status: 'error', message: 'STRIPE_SECRET_KEY nao esta configurado' };
    response.overall_status = 'down';
    response.recommendations.push('Configure STRIPE_SECRET_KEY nos secrets do projeto');
  } else if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
    response.checks.stripe_api = { status: 'error', message: 'Chave invalida: deve comecar com sk_test_ ou sk_live_' };
    response.overall_status = 'down';
  } else {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const account = await stripe.accounts.retrieve();
      response.checks.stripe_api = {
        status: 'ok', message: 'Conectado com sucesso ao Stripe',
        details: { account_name: account.business_profile?.name || account.email || 'N/A', country: account.country || 'N/A' },
      };
    } catch (error) {
      response.checks.stripe_api = { status: 'error', message: 'Erro ao conectar com Stripe' };
      response.overall_status = 'down';
    }
  }

  // Check 2: Products
  try {
    const { data: plans } = await supabase.from('subscription_plans').select('name, stripe_price_id').in('name', ['starter', 'pro']);
    const starterPlan = plans?.find(p => p.name === 'starter');
    const proPlan = plans?.find(p => p.name === 'pro');
    response.checks.products_configured.details = {
      starter: { exists: !!starterPlan?.stripe_price_id, price_id: starterPlan?.stripe_price_id || null },
      pro: { exists: !!proPlan?.stripe_price_id, price_id: proPlan?.stripe_price_id || null },
    };
    const both = !!starterPlan?.stripe_price_id && !!proPlan?.stripe_price_id;
    const hasAny = !!starterPlan?.stripe_price_id || !!proPlan?.stripe_price_id;
    response.checks.products_configured.status = both ? 'ok' : hasAny ? 'partial' : 'missing';
    if (!both) response.overall_status = 'degraded';
  } catch (err) { console.warn('[stripe-health-check] products check failed', err); }

  // Check 3: Webhook
  response.checks.webhook_configured = {
    status: 'warning', message: 'Configure manualmente no Stripe Dashboard',
    endpoint_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`,
  };

  if (response.overall_status === 'healthy') response.recommendations.push('Sistema Stripe totalmente operacional!');

  logStep("Health check completed", { status: response.overall_status });
  return response;
});
