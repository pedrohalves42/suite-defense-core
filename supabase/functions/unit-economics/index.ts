/**
 * Unit Economics - Migrated to serveTenant middleware
 * Super admin only. Calculates SaaS unit economics metrics.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  // Verify super_admin role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  if (!roles || roles.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Super Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[UNIT-ECONOMICS][${requestId}] Calculating metrics for super admin ${userId}`);

  // Get all active subscriptions with pricing
  const { data: subscriptions, error: subsError } = await supabase
    .from('tenant_subscriptions')
    .select(`*, subscription_plans!inner ( name, price_per_device, max_devices )`)
    .in('status', ['active', 'trialing']);

  if (subsError) throw subsError;

  // Calculate MRR
  let totalMrr = 0;
  let activeCount = 0;

  subscriptions?.forEach((sub: Record<string, unknown>) => {
    if (sub.status === 'active') {
      const plan = sub.subscription_plans as Record<string, unknown> | null;
      const pricePerDeviceCents = (plan?.price_per_device as number) || 0;
      const quantity = (sub.device_quantity as number) || 1;
      totalMrr += (pricePerDeviceCents / 100) * quantity;
      activeCount++;
    }
  });

  // Get marketing costs
  const { data: marketingCosts, error: marketingError } = await supabase
    .from('marketing_costs')
    .select('*');

  if (marketingError) {
    logger.info('[UNIT-ECONOMICS] No marketing costs data:', marketingError.message);
  }

  // Calculate CAC
  const totalSpend = marketingCosts?.reduce((sum: number, cost: Record<string, unknown>) => sum + Number(cost.spend_cents || 0) / 100, 0) || 0;
  const totalConversions = marketingCosts?.reduce((sum: number, cost: Record<string, unknown>) => sum + (Number(cost.conversions) || 0), 0) || 0;
  const cac = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Calculate ARPA
  const arpa = activeCount > 0 ? totalMrr / activeCount : 0;

  // Calculate churn rate from canceled subscriptions
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: canceledSubs } = await supabase
    .from('tenant_subscriptions')
    .select('id')
    .eq('status', 'canceled')
    .gte('updated_at', threeMonthsAgo.toISOString());

  const canceledCount = canceledSubs?.length || 0;
  const totalCustomers = activeCount + canceledCount;
  const monthlyChurnRate = totalCustomers > 0 ? (canceledCount / 3) / totalCustomers : 0.05;

  // Calculate LTV
  const grossMargin = 0.85;
  const ltv = monthlyChurnRate > 0 ? (arpa * grossMargin) / monthlyChurnRate : arpa * 12;

  // Calculate Payback Period
  const monthlyGrossProfit = arpa * grossMargin;
  const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : 0;

  // Calculate LTV/CAC ratio
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const arr = totalMrr * 12;

  logger.info(`[UNIT-ECONOMICS][${requestId}] Success: MRR=${totalMrr}, LTV=${ltv}, CAC=${cac}`);

  return {
    mrr: Math.round(totalMrr * 100) / 100,
    arr: Math.round(arr * 100) / 100,
    arpa: Math.round(arpa * 100) / 100,
    cac: Math.round(cac * 100) / 100,
    ltv: Math.round(ltv * 100) / 100,
    ltv_cac_ratio: Math.round(ltvCacRatio * 100) / 100,
    payback_months: Math.round(paybackMonths * 10) / 10,
    churn_rate: Math.round(monthlyChurnRate * 1000) / 10,
    gross_margin: grossMargin * 100,
    active_customers: activeCount,
    total_marketing_spend: Math.round(totalSpend * 100) / 100,
    total_conversions: totalConversions,
  };
}, {
  methods: ['GET'],
  skipTenantValidation: true,
});
