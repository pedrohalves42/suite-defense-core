
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { 
  createChargeSubscriptionUseCase, 
  createCheckSubscriptionUseCase, 
  createManageBillingUseCase, 
  createBillingAnalyticsUseCase 
} from '../../_shared/infrastructure/billing/factory.ts';
import type { HandlerContext } from './admin.ts';

/**
 * Hexagonal Billing Handlers (V2)
 * Consolidates all logic from old billing.ts and billing-stripe.ts
 */

export async function handleChargeSubscription(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = (payload.tenant_id as string) || ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant ID is required', __status: 400 };

  logger.info(`[billing-v2][${requestId}] Charging subscription: ${tenantId}`);
  const useCase = createChargeSubscriptionUseCase(supabase);
  return await useCase.execute(tenantId, requestId);
}

export async function handleCheckSubscriptionV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { subscribed: false, plan_name: 'free', status: 'inactive' };

  logger.info(`[billing-v2][${requestId}] Checking subscription: ${tenantId}`);
  const useCase = createCheckSubscriptionUseCase(supabase);
  return await useCase.execute(tenantId, requestId);
}

export async function handleListInvoicesV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { invoices: [] };

  logger.info(`[billing-v2][${requestId}] Listing invoices: ${tenantId}`);
  const useCase = createManageBillingUseCase(supabase);
  return await useCase.getInvoices(tenantId, requestId);
}

export async function handleCustomerPortalV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant not found', __status: 400 };

  logger.info(`[billing-v2][${requestId}] Creating portal session: ${tenantId}`);
  const useCase = createManageBillingUseCase(supabase);
  const origin = ctx?.req?.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://cybershield.com.br';
  return await useCase.createPortalSession(tenantId, `${origin}/admin/subscriptions`, requestId);
}

export async function handleCreateCheckoutV2(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  const userId = ctx?.userId;
  if (!tenantId || !userId) return { error: 'Authentication required', __status: 401 };

  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (!user?.email) return { error: 'User email not found', __status: 400 };

  const planName = payload.planName as string;
  const extraDevices = Number(payload.extraDevices) || 0;

  logger.info(`[billing-v2][${requestId}] Creating checkout: ${tenantId} (${planName})`);
  const useCase = createManageBillingUseCase(supabase);
  const origin = ctx?.req?.headers.get('origin') || 'https://cybershield.com.br';

  return await useCase.createCheckoutSession({
    tenantId,
    email: user.email,
    planName,
    extraDevices,
    successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/admin/plan-upgrade?canceled=true`,
    traceId: requestId
  });
}

export async function handleCohortAnalysisV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[billing-v2][${requestId}] Running cohort analysis`);
  const useCase = createBillingAnalyticsUseCase(supabase);
  return await useCase.getCohortAnalysis(requestId);
}

export async function handleUnitEconomicsV2(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[billing-v2][${requestId}] Calculating unit economics`);
  const useCase = createBillingAnalyticsUseCase(supabase);
  return await useCase.getUnitEconomics(requestId);
}
