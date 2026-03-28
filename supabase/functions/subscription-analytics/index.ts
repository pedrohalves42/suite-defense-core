/**
 * Subscription Analytics - Migrated to serveTenant middleware
 * Admin/super admin. Calculates subscription metrics (MRR, churn, trends).
 * Super admins see all tenants; regular admins see only their tenant.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface MonthlyData {
  month: string;
  mrr: number;
  new: number;
  churned: number;
}

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  // Check admin role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', userId)
    .in('role', ['admin', 'super_admin']);

  if (!roles || roles.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const isSuperAdmin = roles.some(r => r.role === 'super_admin');
  const tenantId = isSuperAdmin ? null : roles[0].tenant_id;

  logger.info(`[SUBSCRIPTION-ANALYTICS][${requestId}] User ${userId} (super_admin: ${isSuperAdmin})`);

  // Query subscriptions
  let subsQuery = supabase
    .from('tenant_subscriptions')
    .select(`
      *,
      subscription_plans!inner ( name, price_per_device, max_devices ),
      tenants!inner ( name, created_at )
    `);

  if (!isSuperAdmin && tenantId) {
    subsQuery = subsQuery.eq('tenant_id', tenantId);
  }

  const { data: subscriptions, error: subsError } = await subsQuery;
  if (subsError) throw subsError;

  // Calculate MRR
  let totalMrr = 0;
  let activeCount = 0;
  let trialingCount = 0;
  let canceledCount = 0;
  let pastDueCount = 0;

  subscriptions?.forEach((sub: Record<string, unknown>) => {
    const status = sub.status as string;
    const plan = sub.subscription_plans as Record<string, unknown> | null;
    const pricePerDevice = (plan?.price_per_device as number) || 0;
    const quantity = (sub.device_quantity as number) || 1;

    if (status === 'active') {
      activeCount++;
      totalMrr += pricePerDevice * quantity;
    } else if (status === 'trialing') {
      trialingCount++;
    } else if (status === 'canceled') {
      canceledCount++;
    } else if (status === 'past_due') {
      pastDueCount++;
    }
  });

  // Calculate monthly metrics for last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  let auditQuery = supabase
    .from('audit_logs')
    .select('action, resource_type, created_at, details')
    .eq('resource_type', 'subscription')
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: true });

  if (!isSuperAdmin && tenantId) {
    auditQuery = auditQuery.eq('tenant_id', tenantId);
  }

  const { data: auditLogs } = await auditQuery;

  // Process monthly data
  const monthlyDataMap = new Map<string, MonthlyData>();
  const monthKeys: string[] = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthKey = date.toISOString().substring(0, 7);
    monthKeys.push(monthKey);
    monthlyDataMap.set(monthKey, { month: monthKey, mrr: 0, new: 0, churned: 0 });
  }

  let totalTrials = 0;
  let convertedTrials = 0;

  subscriptions?.forEach((sub: Record<string, unknown>) => {
    const createdDate = new Date(sub.created_at as string);
    const createdMonthKey = createdDate.toISOString().substring(0, 7);

    if (monthlyDataMap.has(createdMonthKey)) {
      monthlyDataMap.get(createdMonthKey)!.new++;
    }

    if (sub.trial_end) {
      totalTrials++;
      if (sub.status === 'active') convertedTrials++;
    }

    const plan = sub.subscription_plans as Record<string, unknown> | null;
    const pricePerDevice = (plan?.price_per_device as number) || 0;
    const quantity = (sub.device_quantity as number) || 1;
    const subMrr = pricePerDevice * quantity;

    if (subMrr === 0) return;

    for (const monthKey of monthKeys) {
      const monthStart = new Date(monthKey + '-01T00:00:00Z');
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const wasCreatedBefore = createdDate < monthEnd;
      let wasActiveInMonth = false;

      if (wasCreatedBefore) {
        if (sub.status === 'active') {
          wasActiveInMonth = true;
        } else if (sub.status === 'trialing') {
          const trialEnd = sub.trial_end ? new Date(sub.trial_end as string) : null;
          wasActiveInMonth = !trialEnd || trialEnd >= monthStart;
        } else if (sub.status === 'canceled' || sub.status === 'expired') {
          const updatedAt = new Date((sub.updated_at || sub.created_at) as string);
          wasActiveInMonth = updatedAt >= monthEnd;
        }
      }

      if (wasActiveInMonth) {
        monthlyDataMap.get(monthKey)!.mrr += subMrr;
      }
    }
  });

  auditLogs?.forEach((log: Record<string, unknown>) => {
    if (log.action === 'cancel_subscription') {
      const monthKey = new Date(log.created_at as string).toISOString().substring(0, 7);
      if (monthlyDataMap.has(monthKey)) {
        monthlyDataMap.get(monthKey)!.churned++;
      }
    }
  });

  const revenueTrend = Array.from(monthlyDataMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  const newVsChurned = revenueTrend.map(({ month, new: newSubs, churned }) => ({ month, new: newSubs, churned }));

  const recentChurns = newVsChurned.slice(-3);
  const totalChurned = recentChurns.reduce((sum, m) => sum + m.churned, 0);
  const totalActive = activeCount + trialingCount;
  const churnRate = totalActive > 0 ? (totalChurned / totalActive) * 100 : 0;
  const trialConversionRate = totalTrials > 0 ? (convertedTrials / totalTrials) * 100 : 0;
  const avgRevenuePerCustomer = activeCount > 0 ? totalMrr / activeCount : 0;

  logger.info(`[SUBSCRIPTION-ANALYTICS][${requestId}] Success: MRR=${totalMrr}, Churn=${churnRate}%`);

  return {
    mrr: totalMrr,
    churn_rate: Math.round(churnRate * 10) / 10,
    trial_conversion_rate: Math.round(trialConversionRate * 10) / 10,
    revenue_trend: revenueTrend,
    new_vs_churned: newVsChurned,
    subscriptions_by_status: {
      active: activeCount,
      trialing: trialingCount,
      canceled: canceledCount,
      past_due: pastDueCount,
    },
    total_subscriptions: subscriptions?.length || 0,
    avg_revenue_per_customer: Math.round(avgRevenuePerCustomer * 100) / 100,
  };
}, {
  methods: ['GET'],
  skipTenantValidation: true,
});
