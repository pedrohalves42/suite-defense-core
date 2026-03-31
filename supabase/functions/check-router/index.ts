/**
 * check-router — Consolidated Monitoring & Health Check Router (Phase 3: Inlined)
 * 
 * Inlined handlers (eliminating HTTP hops):
 *   check-task-sla-breach, cron-sentinel, evaluate-job-slo,
 *   check-installation-health, check-production-health,
 *   check-pending-agents, detect-stuck-installations,
 *   monitor-thresholds, build-watchdog, calculate-behavioral-baselines,
 *   compute-compliance-benchmarks
 * 
 * Proxy (complex, >100 lines):
 *   check-action-effectiveness, check-stuck-jobs, sli-collector,
 *   get-installation-pipeline-metrics, analyze-confidence-gap-trend,
 *   analyze-job-failure-patterns, analyze-network-anomalies, health-monitor
 * 
 * Auth: Internal caller (cron/service_role)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { withTimeout } from '../_shared/timeout.ts';
import { recordMetric } from '../_shared/apm.ts';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Actions that are proxied to standalone functions
const PROXY_ACTIONS = new Set([
  'check-action-effectiveness', 'check-stuck-jobs', 'sli-collector',
  'get-installation-pipeline-metrics', 'analyze-confidence-gap-trend',
  'analyze-job-failure-patterns', 'analyze-network-anomalies', 'health-monitor',
]);

// All valid actions (inlined + proxied)
const VALID_ACTIONS = new Set([
  ...PROXY_ACTIONS,
  'check-task-sla-breach', 'cron-sentinel', 'evaluate-job-slo',
  'check-installation-health', 'check-production-health',
  'check-pending-agents', 'detect-stuck-installations',
  'monitor-thresholds', 'build-watchdog', 'calculate-behavioral-baselines',
  'compute-compliance-benchmarks', 'watchdog-non-execution',
]);

const RouterSchema = z.object({
  action: z.string().min(1).max(60),
  payload: z.record(z.unknown()).optional().default({}),
});

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

type SupabaseClientType = ReturnType<typeof createClient>;

// ── Inlined Handlers ────────────────────────────────────────────────────

async function handleCheckTaskSlaBreach(supabase: SupabaseClientType, requestId: string) {
  const startedAt = Date.now();
  logger.info(`[${requestId}] check-task-sla-breach: Starting SLA breach check...`);

  const { data: breachedCount, error: checkError } = await supabase.rpc('check_task_sla_breach');
  if (checkError) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-task-sla-breach', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: checkError.message, p_result: { error: checkError.message }, p_processed_count: 0, p_job_source: 'cron' });
    throw checkError;
  }

  const tasksBreached = breachedCount || 0;
  const { error: anomalyError } = await supabase.rpc('check_job_health_anomalies_and_alert');
  if (anomalyError) logger.warn(`[${requestId}] anomaly check error:`, anomalyError);

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-task-sla-breach', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { tasksBreached, anomalyCheckRan: !anomalyError }, p_processed_count: tasksBreached, p_job_source: 'cron' });
  return { success: true, tasksBreached, anomalyCheckRan: !anomalyError, timestamp: new Date().toISOString() };
}

async function handleEvaluateJobSlo(supabase: SupabaseClientType, requestId: string) {
  const startedAt = Date.now();
  logger.info(`[${requestId}] evaluate-job-slo: Starting SLO evaluation...`);

  const { data, error } = await supabase.rpc('evaluate_job_slo');
  if (error) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'evaluate-job-slo', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: error.message, p_result: { error: error.message }, p_processed_count: 0, p_job_source: 'cron' });
    throw error;
  }

  const results = data || [];
  const tasksCreated = results.filter((r: Record<string, unknown>) => r.out_task_created).length;
  const highBurnRates = results.filter((r: Record<string, unknown>) => (r.out_burn_rate as number) >= 2);

  for (const result of highBurnRates) {
    logger.warn(`[${requestId}] HIGH BURN RATE:`, { tenantId: result.out_tenant_id, burnRate: result.out_burn_rate, errorRate: result.out_error_rate, severity: result.out_severity });
  }

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'evaluate-job-slo', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { tenantsEvaluated: results.length, tasksCreated, highBurnRates: highBurnRates.length }, p_processed_count: results.length, p_job_source: 'cron' });

  return {
    success: true, evaluated: results.length, tasksCreated, highBurnRates: highBurnRates.length,
    results: results.map((r: Record<string, unknown>) => ({ tenantId: r.out_tenant_id, window: r.out_time_window, burnRate: Number(r.out_burn_rate).toFixed(2), errorRate: (Number(r.out_error_rate) * 100).toFixed(2) + '%', severity: r.out_severity, taskCreated: r.out_task_created })),
    timestamp: new Date().toISOString()
  };
}

async function handleCheckInstallationHealth(supabase: SupabaseClientType, requestId: string) {
  const startedAt = Date.now();
  let alertsCreated = 0;

  await withTimeout(async () => {
    logger.info(`[${requestId}] check-installation-health: Verificando taxa de falha por tenant...`);
    const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, name');
    if (tenantsError || !tenants?.length) return;

    for (const tenant of tenants) {
      const { data: failureRate, error } = await supabase.rpc('get_installation_health_status', { p_tenant_id: tenant.id });
      if (error || !failureRate?.length) continue;
      const healthData = failureRate[0];
      const failureRatePct = healthData.failure_rate_pct || 0;
      const threshold = healthData.threshold || 30;
      if (failureRatePct > threshold) {
        const { error: alertError } = await supabase.from('system_alerts').insert({ severity: 'high', alert_type: 'installation_failure', title: 'Alta taxa de falha em instalacoes', message: `Taxa de falha: ${failureRatePct}% (threshold: ${threshold}%)`, details: healthData, tenant_id: tenant.id, trace_id: requestId });
        if (!alertError) alertsCreated++;
      }
    }
  }, { timeoutMs: 60000 });

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-installation-health', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { success: true, alerts_created: alertsCreated }, p_processed_count: alertsCreated, p_job_source: 'cron' });
  return { success: true, alerts_created: alertsCreated };
}

async function handleCheckProductionHealth(supabase: SupabaseClientType, requestId: string) {
  const startedAt = Date.now();
  const alerts: Array<Record<string, unknown>> = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  // CHECK 1: Heartbeats
  const { data: recentHeartbeats, error: heartbeatError } = await supabase.from('agents').select('id, agent_name, last_heartbeat').gte('last_heartbeat', oneHourAgo.toISOString()).neq('status', 'inactive');
  if (!heartbeatError && (!recentHeartbeats || recentHeartbeats.length === 0)) {
    const { count: activeAgentsCount } = await supabase.from('agents').select('*', { count: 'exact', head: true }).in('status', ['active', 'pending']);
    if (activeAgentsCount && activeAgentsCount > 0) {
      alerts.push({ tenant_id: null, alert_type: 'no_heartbeats', severity: 'high', title: 'Nenhum heartbeat na ultima hora', message: `${activeAgentsCount} agente(s) ativo(s) sem heartbeat.`, details: { active_agents_count: activeAgentsCount } });
    }
  }

  // CHECK 2: Installation failure rate
  const { data: installations, error: installError } = await supabase.from('installation_analytics').select('success, event_type').gte('created_at', oneDayAgo.toISOString()).in('event_type', ['post_installation', 'post_installation_unverified']);
  if (!installError && installations && installations.length >= 10) {
    const failureCount = installations.filter(i => i.success === false).length;
    const failureRate = failureCount / installations.length;
    if (failureRate > 0.30) {
      alerts.push({ tenant_id: null, alert_type: 'high_installation_failure', severity: 'critical', title: `Alta taxa de falha: ${(failureRate * 100).toFixed(1)}%`, message: `${failureCount} de ${installations.length} instalacoes falharam.`, details: { failure_rate: failureRate, failed_count: failureCount, total_count: installations.length } });
    }
  }

  // CHECK 3: Queued jobs
  const { count: queuedJobsCount, error: jobsError } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued').lt('created_at', thirtyMinutesAgo.toISOString());
  if (!jobsError && queuedJobsCount && queuedJobsCount > 100) {
    alerts.push({ tenant_id: null, alert_type: 'jobs_stuck', severity: 'high', title: `${queuedJobsCount} jobs em fila ha mais de 30 minutos`, message: 'Jobs nao estao sendo processados.', details: { queued_count: queuedJobsCount } });
  }

  if (alerts.length > 0) {
    for (const alert of alerts) {
      await supabase.from('system_alerts').insert({ ...alert, acknowledged: false, created_at: now.toISOString() });
    }
  }

  const result = { success: true, checked_at: now.toISOString(), alerts_created: alerts.length, alerts: alerts.map(a => ({ type: a.alert_type, severity: a.severity, title: a.title })), checks_performed: { heartbeats: !heartbeatError, installations: !installError, queued_jobs: !jobsError } };
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-production-health', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: result, p_processed_count: alerts.length, p_job_source: 'cron' });
  return result;
}

async function handleDetectBlockedAttempts(supabase: SupabaseClientType, requestId: string) {
  const startedAt = Date.now();
  const timeoutMs = 20000;
  const rpcPromise = supabase.rpc('detect_blocked_access_attempts');
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout after 20s')), timeoutMs));
  const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: unknown; error: Record<string, unknown> | null };

  if (error) {
    const isTimeout = error.code === '57014' || (error.message as string)?.includes('timeout');
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: isTimeout ? 'RPC timeout' : (error.message as string), p_result: null, p_processed_count: 0, p_job_source: 'cron' }); } catch { /* best effort */ }
    return { status: isTimeout ? 'timeout' : 'error', error: isTimeout ? 'Query timed out' : (error.message as string), requestId };
  }

  const insertedCount = (data as Record<string, unknown>[])?.[0]?.inserted_count ?? 0;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { inserted_count: insertedCount }, p_processed_count: insertedCount as number, p_job_source: 'cron' }); } catch { /* best effort */ }
  return { status: 'ok', inserted_count: insertedCount, duration_ms: Date.now() - startedAt, requestId };
}

// Map of inlined action handlers
const INLINED_HANDLERS: Record<string, (supabase: SupabaseClientType, requestId: string, payload: Record<string, unknown>) => Promise<unknown>> = {
  'check-task-sla-breach': handleCheckTaskSlaBreach,
  'evaluate-job-slo': handleEvaluateJobSlo,
  'check-installation-health': handleCheckInstallationHealth,
  'check-production-health': handleCheckProductionHealth,
  'detect-stuck-installations': handleDetectBlockedAttempts,
};

// ── Router ──────────────────────────────────────────────────────────────

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'x-cron-source']) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // Auth check
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);

    const { action, payload } = parsed.data;
    if (!VALID_ACTIONS.has(action)) return jsonRes({ error: `Unknown action: ${action}`, valid_actions: [...VALID_ACTIONS] }, 400, origin);

    // Try inlined handler first
    const inlinedHandler = INLINED_HANDLERS[action];
    if (inlinedHandler) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      logger.info(`[check-router] Inline handling: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      const elapsed = Date.now() - startedAt;
      logger.info(`[check-router] ${action} completed inline in ${elapsed}ms`);
      return jsonRes(result, 200, origin);
    }

    // Proxy to standalone function
    const targetFn = action; // action name matches function name for proxied actions
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[check-router] Proxying ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    const elapsed = Date.now() - startedAt;
    logger.info(`[check-router] ${action} proxy completed in ${elapsed}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });

  } catch (err) {
    logger.error('[check-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
