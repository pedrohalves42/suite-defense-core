
/**
 * Billing inlined handlers (migrated from billing-router + Phase 2B)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import { createAuditLog } from '../../_shared/audit.ts';
import type { HandlerContext } from './admin.ts';

type SB = any;

// ── Phase 1 handlers ────────────────────────────────────────────────────

export async function handleCohortAnalysis(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[${requestId}] Calculating cohorts`);
  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, created_at').order('created_at', { ascending: true });
  if (tenantsError) throw tenantsError;
  const { data: subscriptions, error: subsError } = await supabase.from('tenant_subscriptions').select('tenant_id, status, created_at, updated_at');
  if (subsError) throw subsError;

  const cohortMap = new Map<string, string[]>();
  tenants?.forEach((t: Record<string, unknown>) => {
    const month = (t.created_at as string).slice(0, 7);
    if (!cohortMap.has(month)) cohortMap.set(month, []);
    cohortMap.get(month)!.push(t.id as string);
  });

  interface CohortData { month: string; total: number; active: number; churned: number; retention_rate: number; months_since_creation: number[]; }
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
    for (let i = 0; i <= Math.min(monthsSinceCreation, 12); i++) retentionByMonth.push(Math.max(0, retentionRate - i * (100 - retentionRate) / 12));
    cohorts.push({ month, total: tenantIds.length, active: activeCount, churned: churnedCount, retention_rate: Math.round(retentionRate * 10) / 10, months_since_creation: retentionByMonth.map(r => Math.round(r * 10) / 10) });
  }

  cohorts.sort((a, b) => b.month.localeCompare(a.month));
  const totalTenants = tenants?.length || 0;
  const activeTenants = subscriptions?.filter((s: Record<string, unknown>) => s.status === 'active' || s.status === 'trialing').length || 0;
  const avgRetention = cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + c.retention_rate, 0) / cohorts.length : 0;
  return { cohorts: cohorts.slice(0, 12), summary: { total_tenants: totalTenants, active_tenants: activeTenants, avg_retention_rate: Math.round(avgRetention * 10) / 10, cohort_count: cohorts.length } };
}

export async function handleResetDailyQuotas(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[reset-daily-quotas][${requestId}] Starting daily quota reset`);
  const { error } = await supabase.from('tenant_features').update({ quota_used: 0 }).eq('feature_key', 'advanced_scans_daily');
  if (error) throw error;
  return { success: true, message: 'Daily quotas reset successfully' };
}

export async function handleCheckTenantQuotas(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[${requestId}] Starting quota monitoring`);
  const { data: features, error } = await supabase.from('tenant_features').select(`*, tenants!inner (id, name)`).not('quota_limit', 'is', null).gt('quota_limit', 0);
  if (error) throw error;

  interface QuotaAlert { tenant_id: string; tenant_name: string; feature_key: string; quota_used: number; quota_limit: number; usage_percentage: number; }
  const alerts: QuotaAlert[] = [];

  for (const feature of features || []) {
    const usagePercentage = (feature.quota_used / feature.quota_limit) * 100;
    const threshold = feature.quota_warning_threshold || 80;
    if (usagePercentage >= threshold) {
      const tenant = Array.isArray(feature.tenants) ? feature.tenants[0] : feature.tenants;
      alerts.push({ tenant_id: feature.tenant_id, tenant_name: tenant.name, feature_key: feature.feature_key, quota_used: feature.quota_used, quota_limit: feature.quota_limit, usage_percentage: Math.round(usagePercentage * 100) / 100 });
    }
  }

  const alertResults = [];
  for (const alert of alerts) {
    try {
      const { error: alertError } = await supabase.functions.invoke('ops-gateway', {
        headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
        body: { action: 'notify:email', payload: { channel: 'email', type: 'system', severity: alert.usage_percentage >= 100 ? 'critical' : 'warning', message: `Limite de quota proximo: ${alert.feature_key}`, metadata: { feature: alert.feature_key, usage: `${alert.quota_used} de ${alert.quota_limit}`, percentage: `${alert.usage_percentage}%`, tenant: alert.tenant_name }, tenant_id: alert.tenant_id } },
      });
      alertResults.push({ tenant_id: alert.tenant_id, feature_key: alert.feature_key, success: !alertError });
    } catch (error) {
      alertResults.push({ tenant_id: alert.tenant_id, feature_key: alert.feature_key, success: false, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return { success: true, checked_features: features?.length || 0, alerts_triggered: alerts.length, alerts_sent: alertResults.filter(r => r.success).length, alert_results: alertResults, timestamp: new Date().toISOString() };
}

export async function handleCheckTrialExpiration(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: expiringSoon } = await supabase.from('tenant_subscriptions').select(`tenant_id, trial_end, tenants!inner(id, name, owner_user_id), subscription_plans!inner(name)`).eq('status', 'trialing').gte('trial_end', now.toISOString()).lte('trial_end', sevenDaysFromNow.toISOString()).is('metadata->trial_7day_email_sent', null);
  const { data: expiringTomorrow } = await supabase.from('tenant_subscriptions').select(`tenant_id, trial_end, tenants!inner(id, name, owner_user_id), subscription_plans!inner(name)`).eq('status', 'trialing').gte('trial_end', now.toISOString()).lte('trial_end', oneDayFromNow.toISOString()).is('metadata->trial_1day_email_sent', null);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  for (const sub of expiringSoon || []) {
    const tenant = (sub as Record<string, unknown>).tenants as { name: string; owner_user_id: string };
    await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/notification-router`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ action: 'trial-reminder', payload: { tenant_id: sub.tenant_id, tenant_name: tenant.name, owner_user_id: tenant.owner_user_id, trial_end: sub.trial_end, days_remaining: 7 } }),
    });
    await supabase.from('tenant_subscriptions').update({ metadata: { trial_7day_email_sent: new Date().toISOString() } }).eq('tenant_id', sub.tenant_id);
  }

  for (const sub of expiringTomorrow || []) {
    const tenant = (sub as Record<string, unknown>).tenants as { name: string; owner_user_id: string };
    await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/notification-router`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ action: 'trial-reminder', payload: { tenant_id: sub.tenant_id, tenant_name: tenant.name, owner_user_id: tenant.owner_user_id, trial_end: sub.trial_end, days_remaining: 1 } }),
    });
    await supabase.from('tenant_subscriptions').update({ metadata: { trial_1day_email_sent: new Date().toISOString() } }).eq('tenant_id', sub.tenant_id);
  }

  const result = { success: true, sent_7day: expiringSoon?.length || 0, sent_1day: expiringTomorrow?.length || 0 };
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-trial-expiration', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: result, p_processed_count: (expiringSoon?.length || 0) + (expiringTomorrow?.length || 0), p_job_source: 'cron' });
  return result;
}

export async function handleSecurityCleanup(_supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[api-gateway][${requestId}] Inline security-cleanup → cleanup-router`);
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resp = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/cleanup-router`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ action: 'security' }),
  });
  return await resp.json();
}

// ── Phase 2B: DB-only billing handlers ──────────────────────────────────

// ── create-trial-subscription ───────────────────────────────────────────
export async function handleCreateTrialSubscription(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const tenantId = ctx?.tenantId;
  if (!tenantId) return { error: 'Tenant not found', __status: 400 };

  const { data: existingSubscription } = await supabase
    .from('tenant_subscriptions').select('id').eq('tenant_id', tenantId).single();

  if (existingSubscription) {
    return { success: true, message: 'Subscription already exists', subscription_id: existingSubscription.id };
  }

  const { data: freePlan } = await supabase
    .from('subscription_plans').select('id').eq('name', 'Free').single();

  if (!freePlan) return { error: 'Free plan not found', __status: 500 };

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 14);

  const { data: subscription, error: subscriptionError } = await supabase
    .from('tenant_subscriptions')
    .insert({
      tenant_id: tenantId, plan_id: freePlan.id, status: 'trialing',
      trial_end: trialEndDate.toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: trialEndDate.toISOString(),
    })
    .select().single();

  if (subscriptionError) {
    logger.error(`[create-trial-subscription][${requestId}] Error:`, subscriptionError);
    throw subscriptionError;
  }

  logger.info(`[create-trial-subscription][${requestId}] Trial created for tenant ${tenantId}`);
  // HF-BILLING-AUDIT-01: record trial creation (sanitized).
  await createAuditLog({
    supabase, userId: ctx?.userId, tenantId,
    action: 'billing.trial_created', resourceType: 'tenant_subscription', resourceId: subscription?.id,
    details: { plan: 'Free', trial_days: 14, trial_end: trialEndDate.toISOString(), request_id: requestId },
    request: ctx?.req, success: true,
  });
  return { success: true, subscription, trial_days: 14, trial_end: trialEndDate.toISOString() };
}

// ── create-custom-trial ─────────────────────────────────────────────────
export async function handleCreateCustomTrial(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  const isSuperAdmin = roles?.some((r: any) => r.role === 'super_admin');
  if (!isSuperAdmin) return { error: 'Super admin access required', __status: 403 };

  const { z } = await import('https://esm.sh/zod@3.23.8');
  const CustomTrialSchema = z.object({
    email: z.string().email().max(255),
    company_name: z.string().min(1).max(255),
    contact_name: z.string().max(255).optional(),
    trial_days: z.number().int().min(1).max(365).default(45),
    notes: z.string().max(2000).optional(),
  });

  const parsed = CustomTrialSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors, __status: 400 };
  const { email, company_name, contact_name, trial_days, notes } = parsed.data;

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const emailExists = existingUsers?.users?.some((u: any) => u.email === email);
  if (emailExists) return { error: 'Email already registered', __status: 409 };

  const tempPassword = crypto.randomUUID().replace(/-/g, '').substring(0, 16) + 'Aa1!';
  const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
    user_metadata: { full_name: contact_name || company_name, company_name, custom_trial: true, trial_days },
  });

  if (createUserError || !newUser.user) {
    logger.error('[create-custom-trial] Failed to create user:', createUserError);
    return { error: 'Failed to create user', details: createUserError?.message, __status: 500 };
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  const { data: userRole, error: roleQueryError } = await supabase
    .from('user_roles').select('tenant_id').eq('user_id', newUser.user.id).single();

  if (roleQueryError || !userRole?.tenant_id) {
    return { error: 'Failed to get tenant', __status: 500 };
  }

  const tenantId = userRole.tenant_id;
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + trial_days);

  await supabase.from('tenants').update({ name: company_name }).eq('id', tenantId);
  await supabase.from('tenant_subscriptions').update({ trial_end: trialEnd.toISOString(), status: 'trialing' }).eq('tenant_id', tenantId);

  const { data: customTrial, error: trialError } = await supabase
    .from('custom_trials').insert({
      tenant_id: tenantId, email, company_name, contact_name,
      trial_days, trial_end: trialEnd.toISOString(),
      created_by: userId, notes, status: 'active',
    }).select().single();

  if (trialError) logger.error('[create-custom-trial] Failed to record trial:', trialError);

  await supabase.rpc('ensure_tenant_features', { p_tenant_id: tenantId, p_plan_name: 'starter', p_device_quantity: 30 });

  logger.info(`[create-custom-trial] Created ${trial_days}-day trial for ${company_name} (${email}).`);
  await supabase.auth.admin.generateLink({ type: 'recovery', email });

  // HF-BILLING-AUDIT-01: record custom trial (super-admin action; no PII beyond email domain).
  const emailDomain = email.split('@')[1] || 'unknown';
  await createAuditLog({
    supabase, userId, tenantId,
    action: 'billing.custom_trial_created', resourceType: 'custom_trial', resourceId: customTrial?.id,
    details: {
      plan: 'starter', trial_days, trial_end: trialEnd.toISOString(),
      company_name, email_domain: emailDomain, device_quantity: 30, request_id: requestId,
    },
    request: ctx?.req, success: true,
  });

  return {
    success: true, tenant_id: tenantId, user_id: newUser.user.id, email, company_name,
    trial_days, trial_end: trialEnd.toISOString(), custom_trial_id: customTrial?.id,
    password_reset_sent: true, message: 'Trial created. A password reset link was sent to the user email.',
  };
}

// ── unit-economics ──────────────────────────────────────────────────────
export async function handleUnitEconomics(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin');
  if (!roles || roles.length === 0) return { error: 'Forbidden: Super Admin access required', __status: 403 };

  logger.info(`[UNIT-ECONOMICS][${requestId}] Calculating metrics`);

  const { data: subscriptions, error: subsError } = await supabase
    .from('tenant_subscriptions')
    .select(`*, subscription_plans!inner ( name, price_per_device, max_devices )`)
    .in('status', ['active', 'trialing']);
  if (subsError) throw subsError;

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

  const { data: marketingCosts } = await supabase.from('marketing_costs').select('id, channel, spend_cents, conversions, period_start, period_end');
  const totalSpend = marketingCosts?.reduce((sum: number, cost: Record<string, unknown>) => sum + Number(cost.spend_cents || 0) / 100, 0) || 0;
  const totalConversions = marketingCosts?.reduce((sum: number, cost: Record<string, unknown>) => sum + (Number(cost.conversions) || 0), 0) || 0;
  const cac = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const arpa = activeCount > 0 ? totalMrr / activeCount : 0;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const { data: canceledSubs } = await supabase.from('tenant_subscriptions').select('id').eq('status', 'canceled').gte('updated_at', threeMonthsAgo.toISOString());

  const canceledCount = canceledSubs?.length || 0;
  const totalCustomers = activeCount + canceledCount;
  const monthlyChurnRate = totalCustomers > 0 ? (canceledCount / 3) / totalCustomers : 0.05;
  const grossMargin = 0.85;
  const ltv = monthlyChurnRate > 0 ? (arpa * grossMargin) / monthlyChurnRate : arpa * 12;
  const monthlyGrossProfit = arpa * grossMargin;
  const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : 0;
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;

  return {
    mrr: Math.round(totalMrr * 100) / 100, arr: Math.round(totalMrr * 12 * 100) / 100,
    arpa: Math.round(arpa * 100) / 100, cac: Math.round(cac * 100) / 100,
    ltv: Math.round(ltv * 100) / 100, ltv_cac_ratio: Math.round(ltvCacRatio * 100) / 100,
    payback_months: Math.round(paybackMonths * 10) / 10, churn_rate: Math.round(monthlyChurnRate * 1000) / 10,
    gross_margin: grossMargin * 100, active_customers: activeCount,
    total_marketing_spend: Math.round(totalSpend * 100) / 100, total_conversions: totalConversions,
  };
}

// ── revenue-projections ─────────────────────────────────────────────────
export async function handleRevenueProjections(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin');
  if (!roles || roles.length === 0) return { error: 'Forbidden: Super Admin access required', __status: 403 };

  logger.info(`[REVENUE-PROJECTIONS][${requestId}] Calculating projections`);

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

  let avgTicket = currentCustomers > 0 ? currentMrr / currentCustomers : 100;
  if (typeof payload?.avgTicket === 'number' && payload.avgTicket > 0) avgTicket = payload.avgTicket;

  const scenarios = [
    { name: 'conservative', monthlyGrowthRate: 0.05, churnRate: 0.05, conversionRate: 0.15 },
    { name: 'realistic', monthlyGrowthRate: 0.10, churnRate: 0.03, conversionRate: 0.25 },
    { name: 'optimistic', monthlyGrowthRate: 0.20, churnRate: 0.02, conversionRate: 0.35 },
  ];

  const projections: Record<string, Array<{ month: number; mrr: number; arr: number; customers: number; newCustomers: number; churnedCustomers: number }>> = {};

  for (const scenario of scenarios) {
    const monthlyData: Array<{ month: number; mrr: number; arr: number; customers: number; newCustomers: number; churnedCustomers: number }> = [];
    let mrr = currentMrr || 320;
    let customers = currentCustomers || 5;

    for (let month = 1; month <= 12; month++) {
      const newCustomers = Math.round(customers * scenario.monthlyGrowthRate);
      const churnedCustomers = Math.round(customers * scenario.churnRate);
      customers = customers + newCustomers - churnedCustomers;
      mrr = customers * avgTicket;
      monthlyData.push({ month, mrr: Math.round(mrr * 100) / 100, arr: Math.round(mrr * 12 * 100) / 100, customers, newCustomers, churnedCustomers });
    }
    projections[scenario.name] = monthlyData;
  }

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const currentMonth = new Date().getMonth();
  const monthLabels = Array.from({ length: 12 }, (_, i) => monthNames[(currentMonth + i + 1) % 12]);

  return {
    current: { mrr: Math.round(currentMrr * 100) / 100, arr: Math.round(currentMrr * 12 * 100) / 100, customers: currentCustomers, avg_ticket: Math.round(avgTicket * 100) / 100 },
    projections, month_labels: monthLabels,
    scenarios: scenarios.map(s => ({
      name: s.name, growth_rate: s.monthlyGrowthRate * 100, churn_rate: s.churnRate * 100, conversion_rate: s.conversionRate * 100,
      year_end_mrr: projections[s.name][11].mrr, year_end_arr: projections[s.name][11].arr, year_end_customers: projections[s.name][11].customers,
    })),
  };
}

// ── sales-pipeline ──────────────────────────────────────────────────────
export async function handleSalesPipeline(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin');
  if (!roles || roles.length === 0) return { error: 'Forbidden: Super Admin access required', __status: 403 };

  logger.info(`[SALES-PIPELINE][${requestId}] Request from super admin ${userId}`);

  // Use payload.sub_action to determine operation (gateway is POST-only)
  const subAction = (payload.sub_action as string) || 'list';

  if (subAction === 'list') {
    const { data: deals, error: dealsError } = await supabase.from('sales_pipeline').select('id, company_name, contact_name, contact_email, stage, value, probability, expected_close_date, notes, assigned_to, created_at, updated_at').order('created_at', { ascending: false });
    if (dealsError) throw dealsError;

    const stages = ['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost'];
    const dealsByStage: Record<string, unknown[]> = {};
    stages.forEach(stage => { dealsByStage[stage] = deals?.filter((d: Record<string, unknown>) => d.stage === stage) || []; });

    const totalValue = deals?.reduce((sum: number, d: Record<string, unknown>) => sum + Number(d.value || 0), 0) || 0;
    const weightedValue = deals?.reduce((sum: number, d: Record<string, unknown>) => sum + (Number(d.value || 0) * (Number(d.probability) || 0) / 100), 0) || 0;
    const wonDeals = (dealsByStage.won as unknown[]).length;
    const lostDeals = (dealsByStage.lost as unknown[]).length;
    const closedDeals = wonDeals + lostDeals;
    const winRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;
    const openDeals = (deals?.length || 0) - closedDeals;
    const openValue = deals?.filter((d: Record<string, unknown>) => d.stage !== 'won' && d.stage !== 'lost').reduce((sum: number, d: Record<string, unknown>) => sum + Number(d.value || 0), 0) || 0;

    return {
      deals: deals || [], deals_by_stage: dealsByStage,
      metrics: { total_deals: deals?.length || 0, open_deals: openDeals, won_deals: wonDeals, lost_deals: lostDeals, total_value: Math.round(totalValue * 100) / 100, open_value: Math.round(openValue * 100) / 100, weighted_value: Math.round(weightedValue * 100) / 100, win_rate: Math.round(winRate * 10) / 10 },
    };
  }

  if (subAction === 'create') {
    const { z } = await import('https://esm.sh/zod@3.23.8');
    const CreateDealSchema = z.object({
      company: z.string().min(1).max(255), contact: z.string().min(1).max(255),
      stage: z.enum(['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost']).default('lead'),
      probability: z.number().min(0).max(100).default(10), value: z.number().min(0).default(0),
      expected_close: z.string().datetime().optional(),
    });
    const parsed = CreateDealSchema.safeParse(payload);
    if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten().fieldErrors, __status: 400 };

    const { data: newDeal, error: createError } = await supabase.from('sales_pipeline').insert(parsed.data).select().single();
    if (createError) throw createError;
    logger.info(`[SALES-PIPELINE][${requestId}] Created deal: ${newDeal.id}`);
    return { ...newDeal, __status: 201 };
  }

  if (subAction === 'update') {
    const { z } = await import('https://esm.sh/zod@3.23.8');
    const UpdateDealSchema = z.object({
      id: z.string().uuid(),
      company: z.string().min(1).max(255).optional(), contact: z.string().min(1).max(255).optional(),
      stage: z.enum(['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost']).optional(),
      probability: z.number().min(0).max(100).optional(), value: z.number().min(0).optional(),
      expected_close: z.string().datetime().optional(),
    });
    const parsed = UpdateDealSchema.safeParse(payload);
    if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten().fieldErrors, __status: 400 };

    const { id, ...updateData } = parsed.data;
    const { data: updatedDeal, error: updateError } = await supabase.from('sales_pipeline').update(updateData).eq('id', id).select().single();
    if (updateError) throw updateError;
    logger.info(`[SALES-PIPELINE][${requestId}] Updated deal: ${id}`);
    return updatedDeal;
  }

  if (subAction === 'delete') {
    const dealId = payload.id as string;
    if (!dealId) return { error: 'Deal ID required', __status: 400 };
    const { error: deleteError } = await supabase.from('sales_pipeline').delete().eq('id', dealId);
    if (deleteError) throw deleteError;
    logger.info(`[SALES-PIPELINE][${requestId}] Deleted deal: ${dealId}`);
    return { success: true };
  }

  return { error: 'Unknown sub_action. Use: list, create, update, delete', __status: 400 };
}

// ── subscription-analytics ──────────────────────────────────────────────
export async function handleSubscriptionAnalytics(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { error: 'Authentication required', __status: 401 };

  const { data: roles } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', userId).in('role', ['admin', 'super_admin']);
  if (!roles || roles.length === 0) return { error: 'Forbidden: Admin access required', __status: 403 };

  const isSuperAdmin = roles.some(r => r.role === 'super_admin');
  const tenantId = isSuperAdmin ? null : roles[0].tenant_id;

  logger.info(`[SUBSCRIPTION-ANALYTICS][${requestId}] User ${userId} (super_admin: ${isSuperAdmin})`);

  let subsQuery = supabase.from('tenant_subscriptions').select(`*, subscription_plans!inner ( name, price_per_device, max_devices ), tenants!inner ( name, created_at )`);
  if (!isSuperAdmin && tenantId) subsQuery = subsQuery.eq('tenant_id', tenantId);

  const { data: subscriptions, error: subsError } = await subsQuery;
  if (subsError) throw subsError;

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

    if (status === 'active') { activeCount++; totalMrr += pricePerDevice * quantity; }
    else if (status === 'trialing') trialingCount++;
    else if (status === 'canceled') canceledCount++;
    else if (status === 'past_due') pastDueCount++;
  });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  let auditQuery = supabase.from('audit_logs').select('action, resource_type, created_at, details').eq('resource_type', 'subscription').gte('created_at', sixMonthsAgo.toISOString()).order('created_at', { ascending: true });
  if (!isSuperAdmin && tenantId) auditQuery = auditQuery.eq('tenant_id', tenantId);
  const { data: auditLogs } = await auditQuery;

  interface MonthlyData { month: string; mrr: number; new: number; churned: number; }
  const monthlyDataMap = new Map<string, MonthlyData>();
  const monthKeys: string[] = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(); date.setMonth(date.getMonth() - i);
    const monthKey = date.toISOString().substring(0, 7);
    monthKeys.push(monthKey);
    monthlyDataMap.set(monthKey, { month: monthKey, mrr: 0, new: 0, churned: 0 });
  }

  let totalTrials = 0;
  let convertedTrials = 0;

  subscriptions?.forEach((sub: Record<string, unknown>) => {
    const createdDate = new Date(sub.created_at as string);
    const createdMonthKey = createdDate.toISOString().substring(0, 7);
    if (monthlyDataMap.has(createdMonthKey)) monthlyDataMap.get(createdMonthKey)!.new++;
    if (sub.trial_end) { totalTrials++; if (sub.status === 'active') convertedTrials++; }

    const plan = sub.subscription_plans as Record<string, unknown> | null;
    const pricePerDevice = (plan?.price_per_device as number) || 0;
    const quantity = (sub.device_quantity as number) || 1;
    const subMrr = pricePerDevice * quantity;
    if (subMrr === 0) return;

    for (const monthKey of monthKeys) {
      const monthStart = new Date(monthKey + '-01T00:00:00Z');
      const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
      const wasCreatedBefore = createdDate < monthEnd;
      let wasActiveInMonth = false;

      if (wasCreatedBefore) {
        if (sub.status === 'active') wasActiveInMonth = true;
        else if (sub.status === 'trialing') {
          const trialEnd = sub.trial_end ? new Date(sub.trial_end as string) : null;
          wasActiveInMonth = !trialEnd || trialEnd >= monthStart;
        } else if (sub.status === 'canceled' || sub.status === 'expired') {
          const updatedAt = new Date((sub.updated_at || sub.created_at) as string);
          wasActiveInMonth = updatedAt >= monthEnd;
        }
      }

      if (wasActiveInMonth) monthlyDataMap.get(monthKey)!.mrr += subMrr;
    }
  });

  auditLogs?.forEach((log: Record<string, unknown>) => {
    if (log.action === 'cancel_subscription') {
      const monthKey = new Date(log.created_at as string).toISOString().substring(0, 7);
      if (monthlyDataMap.has(monthKey)) monthlyDataMap.get(monthKey)!.churned++;
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

  return {
    mrr: totalMrr, churn_rate: Math.round(churnRate * 10) / 10,
    trial_conversion_rate: Math.round(trialConversionRate * 10) / 10,
    revenue_trend: revenueTrend, new_vs_churned: newVsChurned,
    subscriptions_by_status: { active: activeCount, trialing: trialingCount, canceled: canceledCount, past_due: pastDueCount },
    total_subscriptions: subscriptions?.length || 0,
    avg_revenue_per_customer: Math.round(avgRevenuePerCustomer * 100) / 100,
  };
}

// ── send-trial-reminder ─────────────────────────────────────────────────
export async function handleSendTrialReminder(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { z } = await import('https://esm.sh/zod@3.23.8');
  const TrialBodySchema = z.object({
    tenant_id: z.string().uuid(), tenant_name: z.string().min(1),
    owner_user_id: z.string().uuid(), trial_end: z.string().min(1),
    days_remaining: z.number().int(),
  });

  const parsed = TrialBodySchema.safeParse(payload);
  if (!parsed.success) return { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors, __status: 400 };
  const { tenant_id, tenant_name, owner_user_id, trial_end, days_remaining } = parsed.data;

  logger.info(`[SEND-TRIAL-REMINDER][${requestId}] Sending ${days_remaining}-day reminder for tenant: ${tenant_id}`);

  const { data: userData } = await supabase.auth.admin.getUserById(owner_user_id);
  if (!userData.user?.email) throw new Error('Owner email not found');

  const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle();
  const lang = ((tenantData?.settings as Record<string, unknown>)?.language as string) || 'pt-BR';

  const translations: Record<string, Record<string, unknown>> = {
    'pt-BR': {
      subject7: (d: number) => `? Seu trial expira em ${d} dias`,
      subject1: '[WARN] ? Seu trial expira amanha!',
      greeting: 'Ola', headerSubtitle: 'Protecao Avancada para seus Dispositivos',
      trialEnding7: (d: number, date: string) => `Seu periodo de trial esta chegando ao fim e expira em <strong>${d} dias</strong>, no dia <strong>${date}</strong>.`,
      enjoying: 'Esperamos que voce esteja aproveitando todos os recursos premium do CyberShield!',
      warningLabel: '[WARN] ? Atencao:',
      trialEnding1: (date: string) => `Seu trial expira <strong>amanha, ${date}</strong>!`,
      choosePlan: 'Para continuar aproveitando todos os recursos de protecao avancada, escolha um plano agora.',
      featuresTitle: 'O que voce tem acesso no trial:',
      features: ['Monitoramento em tempo real de dispositivos', 'Scans de virus ilimitados', 'Dashboard de seguranca avancado', 'Alertas e notificacoes automaticas', 'Suporte por email'],
      dontLose: 'Nao perca acesso a esses recursos!',
      cta7: 'Ver Planos Disponiveis', cta1: '? Assinar Agora',
      afterTrial: 'Apos o trial, voce sera automaticamente migrado para o plano gratuito com recursos limitados, a menos que escolha um dos nossos planos pagos.',
      footer1: 'CyberShield - Protecao que voce pode confiar',
      footer2: 'Esta e uma mensagem automatica. Por favor, nao responda este email.',
    },
    en: {
      subject7: (d: number) => `? Your trial expires in ${d} days`,
      subject1: '[WARN] ? Your trial expires tomorrow!',
      greeting: 'Hello', headerSubtitle: 'Advanced Protection for your Devices',
      trialEnding7: (d: number, date: string) => `Your trial period is ending and expires in <strong>${d} days</strong>, on <strong>${date}</strong>.`,
      enjoying: 'We hope you are enjoying all the premium features of CyberShield!',
      warningLabel: '[WARN] ? Attention:',
      trialEnding1: (date: string) => `Your trial expires <strong>tomorrow, ${date}</strong>!`,
      choosePlan: 'To continue enjoying all advanced protection features, choose a plan now.',
      featuresTitle: 'What you have access to during the trial:',
      features: ['Real-time device monitoring', 'Unlimited virus scans', 'Advanced security dashboard', 'Automatic alerts and notifications', 'Email support'],
      dontLose: "Don't lose access to these features!",
      cta7: 'View Available Plans', cta1: '? Subscribe Now',
      afterTrial: 'After the trial, you will be automatically moved to the free plan with limited features, unless you choose one of our paid plans.',
      footer1: 'CyberShield - Protection you can trust',
      footer2: 'This is an automated message. Please do not reply to this email.',
    },
  };

  const getStrings = (l: string) => {
    if (translations[l]) return translations[l];
    if (l?.startsWith('pt')) return translations['pt-BR'];
    return translations['pt-BR'];
  };

  const t = getStrings(lang);
  const locale = lang?.startsWith('en') ? 'en-US' : 'pt-BR';
  const trialEndDate = new Date(trial_end).toLocaleDateString(locale);

  const subject = days_remaining === 7 ? (t.subject7 as (d: number) => string)(days_remaining) : t.subject1 as string;
  const featuresHtml = (t.features as string[]).map((f: string) => `<li>[OK]  ${f}</li>`).join('\n                ');

  const bodyContent = days_remaining === 7
    ? `<p>${(t.trialEnding7 as (d: number, date: string) => string)(days_remaining, trialEndDate)}</p><p>${t.enjoying}</p>`
    : `<div class="warning"><strong>${t.warningLabel}</strong> ${(t.trialEnding1 as (date: string) => string)(trialEndDate)}</div><p>${t.choosePlan}</p>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;border-radius:8px 8px 0 0;text-align:center}.content{background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}.cta-button{display:inline-block;background:#667eea;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;margin:20px 0}.warning{background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:20px 0;border-radius:4px}.footer{text-align:center;color:#6b7280;font-size:14px;margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb}</style></head><body><div class="container"><div class="header"><h1 style="margin:0">?? CyberShield</h1><p style="margin:10px 0 0 0;opacity:0.9">${t.headerSubtitle}</p></div><div class="content"><h2>${t.greeting}, ${tenant_name}!</h2>${bodyContent}<p><strong>${t.featuresTitle}</strong></p><ul>${featuresHtml}</ul><p><strong>${t.dontLose}</strong></p><div style="text-align:center;margin:30px 0"><a href="${Deno.env.get('SUPABASE_URL')}/admin/plan-upgrade" class="cta-button">${days_remaining === 7 ? t.cta7 : t.cta1}</a></div><p style="color:#6b7280;font-size:14px">${t.afterTrial}</p></div><div class="footer"><p>${t.footer1}</p><p>${t.footer2}</p></div></div></body></html>`;

  const { Resend } = await import('https://esm.sh/resend@2.0.0');
  const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

  const { data: emailData, error: emailError } = await resend.emails.send({
    from: 'CyberShield <onboarding@resend.dev>',
    to: [userData.user.email],
    subject,
    html,
  });

  if (emailError) { logger.error(`[SEND-TRIAL-REMINDER][${requestId}] Email error:`, emailError); throw emailError; }

  logger.info(`[SEND-TRIAL-REMINDER][${requestId}] Email sent successfully:`, emailData);
  return { success: true, email_id: emailData?.id };
}