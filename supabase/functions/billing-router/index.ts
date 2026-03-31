/**
 * billing-router — Consolidated Billing & Subscription Router (Phase 3: Inlined)
 * 
 * Inlined handlers:
 *   cohort-analysis, reset-daily-quotas, check-tenant-quotas, check-trial-expiration
 * 
 * Proxy (complex, Stripe SDK, or >100 lines):
 *   create-checkout, create-stripe-products, create-stripe-products-extended,
 *   create-trial-subscription, create-custom-trial, manage-subscription,
 *   check-subscription, customer-portal, list-invoices, stripe-health-check,
 *   subscription-analytics, unit-economics, revenue-projections,
 *   sales-pipeline, send-trial-reminder
 * 
 * Auth: Mixed (internal for cron actions, JWT for user actions)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PROXY_ACTIONS = new Set([
  'create-checkout', 'create-stripe-products', 'create-stripe-products-extended',
  'create-trial-subscription', 'create-custom-trial', 'manage-subscription',
  'check-subscription', 'customer-portal', 'list-invoices', 'stripe-health-check',
  'subscription-analytics', 'unit-economics', 'revenue-projections',
  'sales-pipeline', 'send-trial-reminder',
]);

const VALID_ACTIONS = new Set([
  ...PROXY_ACTIONS,
  'cohort-analysis', 'reset-daily-quotas', 'check-tenant-quotas', 'check-trial-expiration',
]);

const RouterSchema = z.object({
  action: z.string().min(1).max(60),
  payload: z.record(z.unknown()).optional().default({}),
});

type SB = ReturnType<typeof createClient>;

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ── Inlined Handlers ────────────────────────────────────────────────────

async function handleCohortAnalysis(supabase: SB, requestId: string) {
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

async function handleResetDailyQuotas(supabase: SB, requestId: string) {
  logger.info(`[reset-daily-quotas][${requestId}] Starting daily quota reset`);
  const { error } = await supabase.from('tenant_features').update({ quota_used: 0 }).eq('feature_key', 'advanced_scans_daily');
  if (error) throw error;
  return { success: true, message: 'Daily quotas reset successfully' };
}

async function handleCheckTenantQuotas(supabase: SB, requestId: string) {
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
      const { error: alertError } = await supabase.functions.invoke('notification-dispatcher', {
        headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
        body: { channel: 'email', type: 'system', severity: alert.usage_percentage >= 100 ? 'critical' : 'warning', message: `Limite de quota proximo: ${alert.feature_key}`, metadata: { feature: alert.feature_key, usage: `${alert.quota_used} de ${alert.quota_limit}`, percentage: `${alert.usage_percentage}%`, tenant: alert.tenant_name }, tenant_id: alert.tenant_id },
      });
      alertResults.push({ tenant_id: alert.tenant_id, feature_key: alert.feature_key, success: !alertError });
    } catch (error) {
      alertResults.push({ tenant_id: alert.tenant_id, feature_key: alert.feature_key, success: false, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return { success: true, checked_features: features?.length || 0, alerts_triggered: alerts.length, alerts_sent: alertResults.filter(r => r.success).length, alert_results: alertResults, timestamp: new Date().toISOString() };
}

async function handleCheckTrialExpiration(supabase: SB, requestId: string) {
  const startedAt = Date.now();
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: expiringSoon } = await supabase.from('tenant_subscriptions').select(`tenant_id, trial_end, tenants!inner(id, name, owner_user_id), subscription_plans!inner(name)`).eq('status', 'trialing').gte('trial_end', now.toISOString()).lte('trial_end', sevenDaysFromNow.toISOString()).is('metadata->trial_7day_email_sent', null);
  const { data: expiringTomorrow } = await supabase.from('tenant_subscriptions').select(`tenant_id, trial_end, tenants!inner(id, name, owner_user_id), subscription_plans!inner(name)`).eq('status', 'trialing').gte('trial_end', now.toISOString()).lte('trial_end', oneDayFromNow.toISOString()).is('metadata->trial_1day_email_sent', null);

  for (const sub of expiringSoon || []) {
    const tenant = (sub as Record<string, unknown>).tenants as { name: string; owner_user_id: string };
    await supabase.functions.invoke('notification-router', { body: { action: 'trial-reminder', payload: { tenant_id: sub.tenant_id, tenant_name: tenant.name, owner_user_id: tenant.owner_user_id, trial_end: sub.trial_end, days_remaining: 7 } } });
    await supabase.from('tenant_subscriptions').update({ metadata: { trial_7day_email_sent: new Date().toISOString() } }).eq('tenant_id', sub.tenant_id);
  }

  for (const sub of expiringTomorrow || []) {
    const tenant = (sub as Record<string, unknown>).tenants as { name: string; owner_user_id: string };
    await supabase.functions.invoke('notification-router', { body: { action: 'trial-reminder', payload: { tenant_id: sub.tenant_id, tenant_name: tenant.name, owner_user_id: tenant.owner_user_id, trial_end: sub.trial_end, days_remaining: 1 } } });
    await supabase.from('tenant_subscriptions').update({ metadata: { trial_1day_email_sent: new Date().toISOString() } }).eq('tenant_id', sub.tenant_id);
  }

  const result = { success: true, sent_7day: expiringSoon?.length || 0, sent_1day: expiringTomorrow?.length || 0 };
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-trial-expiration', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: result, p_processed_count: (expiringSoon?.length || 0) + (expiringTomorrow?.length || 0), p_job_source: 'cron' });
  return result;
}

const INLINED_HANDLERS: Record<string, (supabase: SB, requestId: string, payload: Record<string, unknown>) => Promise<unknown>> = {
  'cohort-analysis': handleCohortAnalysis,
  'reset-daily-quotas': handleResetDailyQuotas,
  'check-tenant-quotas': handleCheckTenantQuotas,
  'check-trial-expiration': handleCheckTrialExpiration,
};

// ── Router ──────────────────────────────────────────────────────────────

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'x-cron-source']) { const v = req.headers.get(name); if (v) h[name] = v; }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);

    const { action, payload } = parsed.data;
    if (!VALID_ACTIONS.has(action)) return jsonRes({ error: `Unknown action: ${action}`, valid_actions: [...VALID_ACTIONS] }, 400, origin);

    const inlinedHandler = INLINED_HANDLERS[action];
    if (inlinedHandler) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      logger.info(`[billing-router] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      logger.info(`[billing-router] ${action} done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    const targetFn = action;
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[billing-router] Proxy: ${action}`, { requestId });
    const response = await fetchWithTimeout(url, { method: 'POST', headers: forwardHeaders(req, requestId), body: JSON.stringify(payload), timeoutMs: FETCH_TIMEOUT_MS });
    const responseData = await response.text();
    logger.info(`[billing-router] ${action} proxy done in ${Date.now() - startedAt}ms`);
    return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });

  } catch (err) {
    logger.error('[billing-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
