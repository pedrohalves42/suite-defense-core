
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { createBillingRepository, createPaymentGateway } from '../../_shared/infrastructure/billing/factory.ts';
import { ChargeSubscriptionUseCase } from '../../_shared/domain/billing/use-cases/charge-subscription.use-case.ts';
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

  const billingRepo = createBillingRepository(supabase);
  const paymentGateway = createPaymentGateway();
  const useCase = new ChargeSubscriptionUseCase(billingRepo, paymentGateway);

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
