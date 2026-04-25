
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { BillingRepository } from '../../domain/billing/ports/billing-repository.port.ts';
import { PaymentGateway } from '../../domain/billing/ports/payment-gateway.port.ts';
import { SupabaseBillingRepository } from './adapters/supabase-billing-repository.ts';
import { StripePaymentGateway } from './adapters/stripe-payment-gateway.ts';
import { ManualPaymentGateway } from './adapters/manual-payment-gateway.ts';
import { TestDoublePaymentGateway } from './adapters/test-double-payment-gateway.ts';

export function createBillingRepository(supabase: SupabaseClient): BillingRepository {
  return new SupabaseBillingRepository(supabase);
}

export function createPaymentGateway(): PaymentGateway {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const env = Deno.env.get('ENVIRONMENT');

  if (env === 'test') {
    return new TestDoublePaymentGateway();
  }

  if (stripeKey && (stripeKey.startsWith('sk_test_') || stripeKey.startsWith('sk_live_'))) {
    return new StripePaymentGateway(stripeKey);
  }

  return new ManualPaymentGateway();
}
