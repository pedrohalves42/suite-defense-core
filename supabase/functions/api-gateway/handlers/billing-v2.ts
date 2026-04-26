
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { createChargeSubscriptionUseCase, createPaymentGateway, createBillingRepository } from '../../_shared/infrastructure/billing/factory.ts';
import type { HandlerContext } from './admin.ts';

/**
 * Hexagonal Billing Handlers (V2)
 */

export async function handleChargeSubscription(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = (payload.tenant_id as string) || ctx?.tenantId;
  
  if (!tenantId) {
    return { error: 'Tenant ID is required', __status: 400 };
  }

  logger.info(`[billing-v2][${requestId}] Charging subscription for tenant: ${tenantId}`);

  const useCase = createChargeSubscriptionUseCase(supabase);
  const result = await useCase.execute(tenantId);

  if (!result.success) {
    logger.error(`[billing-v2][${requestId}] Charge failed: ${result.error}`);
    return { success: false, error: result.error, __status: 400 };
  }

  logger.info(`[billing-v2][${requestId}] Charge successful: ${result.transactionId}`);
  return { 
    success: true, 
    transaction_id: result.transactionId,
    amount: result.amount,
    currency: result.currency
  };
}

export async function handleCheckSubscriptionV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { subscribed: false, plan_name: 'free', status: 'inactive' };

  logger.info(`[billing-v2][${requestId}] Checking subscription for tenant: ${tenantId}`);

  const useCase = createChargeSubscriptionUseCase(supabase);
  return await useCase.checkSubscription(tenantId);
}

export async function handleCustomerPortalV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant not found', __status: 400 };

  const repo = createBillingRepository(supabase);
  const gateway = createPaymentGateway();
  
  const subscription = await repo.getSubscriptionByTenantId(tenantId);
  if (!subscription?.stripeCustomerId) {
    return { error: 'Nenhuma assinatura Stripe encontrada.', code: 'NO_STRIPE_CUSTOMER' };
  }

  const origin = ctx?.req?.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://cybershield.com.br';
  const url = await gateway.createPortalSession(subscription.stripeCustomerId, `${origin}/admin/subscriptions`);

  return { url };
}

