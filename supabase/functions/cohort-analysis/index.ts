/**
 * cohort-analysis → Migrated to serveInternal middleware
 * Note: Also supports JWT super_admin access via assertInternalCaller's allowAuthenticatedUsers.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface CohortData { month: string; total: number; active: number; churned: number; retention_rate: number; months_since_creation: number[]; }

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  logger.info(`[${requestId}] Calculating cohorts`);

  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, created_at').order('created_at', { ascending: true });
  if (tenantsError) throw tenantsError;

  const { data: subscriptions, error: subsError } = await supabase.from('tenant_subscriptions').select('tenant_id, status, created_at, updated_at');
  if (subsError) throw subsError;

  const cohortMap = new Map<string, string[]>();
  tenants?.forEach((tenant: Record<string, unknown>) => {
    const month = (tenant.created_at as string).slice(0, 7);
    if (!cohortMap.has(month)) cohortMap.set(month, []);
    cohortMap.get(month)!.push(tenant.id as string);
  });

  const cohorts: CohortData[] = [];
  const now = new Date();

  for (const [month, tenantIds] of cohortMap.entries()) {
    const cohortDate = new Date(month + '-01');
    const monthsSinceCreation = Math.floor((now.getTime() - cohortDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const cohortSubs = subscriptions?.filter((s: Record<string, unknown>) => tenantIds.includes(s.tenant_id as string)) || [];
    const activeCount = cohortSubs.filter((s: Record<string, unknown>) => s.status === 'active' || s.status === 'trialing').length;
    const churnedCount = cohortSubs.filter((s: Record<string, unknown>) => s.status === 'canceled').length;
    const retentionRate = tenantIds.length > 0 ? (activeCount / tenantIds.length) * 100 : 0;

    const retentionByMonth: number[] = [];
    for (let i = 0; i <= Math.min(monthsSinceCreation, 12); i++) {
      retentionByMonth.push(Math.max(0, retentionRate - i * (100 - retentionRate) / 12));
    }

    cohorts.push({ month, total: tenantIds.length, active: activeCount, churned: churnedCount, retention_rate: Math.round(retentionRate * 10) / 10, months_since_creation: retentionByMonth.map(r => Math.round(r * 10) / 10) });
  }

  cohorts.sort((a, b) => b.month.localeCompare(a.month));

  const totalTenants = tenants?.length || 0;
  const activeTenants = subscriptions?.filter((s: Record<string, unknown>) => s.status === 'active' || s.status === 'trialing').length || 0;
  const avgRetention = cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + c.retention_rate, 0) / cohorts.length : 0;

  return { cohorts: cohorts.slice(0, 12), summary: { total_tenants: totalTenants, active_tenants: activeTenants, avg_retention_rate: Math.round(avgRetention * 10) / 10, cohort_count: cohorts.length } };
});
