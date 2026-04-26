
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { SupabaseBillingRepository } from './adapters/supabase-billing-repository.ts';
import { StripePaymentGateway } from './adapters/stripe-payment-gateway.ts';
import { ChargeSubscriptionUseCase, CheckSubscriptionUseCase } from '../../domain/billing/use-cases/charge-subscription.use-case.ts';
import { ManageBillingUseCase } from '../../domain/billing/use-cases/manage-billing.use-case.ts';
import { BillingAnalyticsUseCase } from '../../domain/billing/use-cases/billing-analytics.use-case.ts';

export function createBillingRepository(supabase: SupabaseClient) {
  return new SupabaseBillingRepository(supabase);
}

export function createPaymentGateway() {
  const apiKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
  return new StripePaymentGateway(apiKey);
}

export function createChargeSubscriptionUseCase(supabase: SupabaseClient) {
  return new ChargeSubscriptionUseCase(
    createBillingRepository(supabase),
    createPaymentGateway()
  );
}

export function createCheckSubscriptionUseCase(supabase: SupabaseClient) {
  return new CheckSubscriptionUseCase(
    createBillingRepository(supabase),
    createPaymentGateway()
  );
}

export function createManageBillingUseCase(supabase: SupabaseClient) {
  return new ManageBillingUseCase(
    createBillingRepository(supabase),
    createPaymentGateway()
  );
}

export function createBillingAnalyticsUseCase(supabase: SupabaseClient) {
  return new BillingAnalyticsUseCase(
    createBillingRepository(supabase)
  );
}
