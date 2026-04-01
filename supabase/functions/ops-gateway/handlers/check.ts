/**
 * Check/monitoring inlined handlers (migrated from check-router)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { withTimeout } from '../../_shared/timeout.ts';

type SB = ReturnType<typeof createClient>;

export async function handleCheckTaskSlaBreach(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
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

export async function handleEvaluateJobSlo(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
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
    timestamp: new Date().toISOString(),
  };
}

export async function handleCheckInstallationHealth(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
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

export async function handleCheckProductionHealth(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const alerts: Array<Record<string, unknown>> = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const { data: recentHeartbeats, error: heartbeatError } = await supabase.from('agents').select('id, agent_name, last_heartbeat').gte('last_heartbeat', oneHourAgo.toISOString()).neq('status', 'inactive');
  if (!heartbeatError && (!recentHeartbeats || recentHeartbeats.length === 0)) {
    const { count: activeAgentsCount } = await supabase.from('agents').select('*', { count: 'exact', head: true }).in('status', ['active', 'pending']);
    if (activeAgentsCount && activeAgentsCount > 0) {
      alerts.push({ tenant_id: null, alert_type: 'no_heartbeats', severity: 'high', title: 'Nenhum heartbeat na ultima hora', message: `${activeAgentsCount} agente(s) ativo(s) sem heartbeat.`, details: { active_agents_count: activeAgentsCount }, trace_id: requestId });
    }
  }

  const { data: installations, error: installError } = await supabase.from('installation_analytics').select('success, event_type').gte('created_at', oneDayAgo.toISOString()).in('event_type', ['post_installation', 'post_installation_unverified']);
  if (!installError && installations && installations.length >= 10) {
    const failureCount = installations.filter(i => i.success === false).length;
    const failureRate = failureCount / installations.length;
    if (failureRate > 0.30) {
      alerts.push({ tenant_id: null, alert_type: 'high_installation_failure', severity: 'critical', title: `Alta taxa de falha: ${(failureRate * 100).toFixed(1)}%`, message: `${failureCount} de ${installations.length} instalacoes falharam.`, details: { failure_rate: failureRate, failed_count: failureCount, total_count: installations.length }, trace_id: requestId });
    }
  }

  const { count: queuedJobsCount, error: jobsError } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued').lt('created_at', thirtyMinutesAgo.toISOString());
  if (!jobsError && queuedJobsCount && queuedJobsCount > 100) {
    alerts.push({ tenant_id: null, alert_type: 'jobs_stuck', severity: 'high', title: `${queuedJobsCount} jobs em fila ha mais de 30 minutos`, message: 'Jobs nao estao sendo processados.', details: { queued_count: queuedJobsCount }, trace_id: requestId });
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

export async function handleDetectBlockedAttempts(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const timeoutMs = 20000;
  const rpcPromise = supabase.rpc('detect_blocked_access_attempts');
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout after 20s')), timeoutMs));
  const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: unknown; error: Record<string, unknown> | null };

  if (error) {
    const isTimeout = error.code === '57014' || (error.message as string)?.includes('timeout');
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: isTimeout ? 'RPC timeout' : (error.message as string), p_result: null, p_processed_count: 0, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] log_scheduled_job_run failed', err); }
    return { status: isTimeout ? 'timeout' : 'error', error: isTimeout ? 'Query timed out' : (error.message as string), requestId };
  }

  const insertedCount = (data as Record<string, unknown>[])?.[0]?.inserted_count ?? 0;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { inserted_count: insertedCount }, p_processed_count: insertedCount as number, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] log_scheduled_job_run failed', err); }
  return { status: 'ok', inserted_count: insertedCount, duration_ms: Date.now() - startedAt, requestId };
}
