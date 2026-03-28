/**
 * Revenue Projections - Migrated to serveTenant middleware
 * Super admin only. Calculates 12-month revenue projections.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ProjectionParamsSchema = z.object({
  avgTicket: z.number().positive().optional(),
}).optional();

interface Scenario {
  name: string;
  monthlyGrowthRate: number;
  churnRate: number;
  conversionRate: number;
}

interface MonthlyProjection {
  month: number;
  mrr: number;
  arr: number;
  customers: number;
  newCustomers: number;
  churnedCustomers: number;
}

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

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

  logger.info(`[REVENUE-PROJECTIONS][${requestId}] Calculating projections for super admin ${userId}`);

  // Get current MRR
  const { data: subscriptions, error: subsError } = await supabase
    .from('tenant_subscriptions')
    .select(`*, subscription_plans!inner ( price_per_device )`)
    .eq('status', 'active');

  if (subsError) throw subsError;

  let currentMrr = 0;
  let currentCustomers = 0;

  subscriptions?.forEach((sub: Record<string, unknown>) => {
    const plan = sub.subscription_plans as Record<string, unknown> | null;
    const pricePerDeviceCents = (plan?.price_per_device as number) || 0;
    const quantity = (sub.device_quantity as number) || 1;
    currentMrr += (pricePerDeviceCents / 100) * quantity;
    currentCustomers++;
  });

  // Parse optional custom parameters
  const parsed = ProjectionParamsSchema.safeParse(body);
  let avgTicket = currentCustomers > 0 ? currentMrr / currentCustomers : 100;
  if (parsed.success && parsed.data?.avgTicket) {
    avgTicket = parsed.data.avgTicket;
  }

  // Define scenarios
  const scenarios: Scenario[] = [
    { name: 'conservative', monthlyGrowthRate: 0.05, churnRate: 0.05, conversionRate: 0.15 },
    { name: 'realistic', monthlyGrowthRate: 0.10, churnRate: 0.03, conversionRate: 0.25 },
    { name: 'optimistic', monthlyGrowthRate: 0.20, churnRate: 0.02, conversionRate: 0.35 },
  ];

  // Generate 12-month projections for each scenario
  const projections: Record<string, MonthlyProjection[]> = {};

  for (const scenario of scenarios) {
    const monthlyData: MonthlyProjection[] = [];
    let mrr = currentMrr || 320;
    let customers = currentCustomers || 5;

    for (let month = 1; month <= 12; month++) {
      const newCustomers = Math.round(customers * scenario.monthlyGrowthRate);
      const churnedCustomers = Math.round(customers * scenario.churnRate);
      customers = customers + newCustomers - churnedCustomers;
      mrr = customers * avgTicket;

      monthlyData.push({
        month,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        customers,
        newCustomers,
        churnedCustomers,
      });
    }

    projections[scenario.name] = monthlyData;
  }

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const currentMonth = new Date().getMonth();
  const monthLabels = Array.from({ length: 12 }, (_, i) => monthNames[(currentMonth + i + 1) % 12]);

  logger.info(`[REVENUE-PROJECTIONS][${requestId}] Success: Current MRR=${currentMrr}, Customers=${currentCustomers}`);

  return {
    current: {
      mrr: Math.round(currentMrr * 100) / 100,
      arr: Math.round(currentMrr * 12 * 100) / 100,
      customers: currentCustomers,
      avg_ticket: Math.round(avgTicket * 100) / 100,
    },
    projections,
    month_labels: monthLabels,
    scenarios: scenarios.map(s => ({
      name: s.name,
      growth_rate: s.monthlyGrowthRate * 100,
      churn_rate: s.churnRate * 100,
      conversion_rate: s.conversionRate * 100,
      year_end_mrr: projections[s.name][11].mrr,
      year_end_arr: projections[s.name][11].arr,
      year_end_customers: projections[s.name][11].customers,
    })),
  };
}, {
  methods: ['GET', 'POST'],
  skipTenantValidation: true,
});
