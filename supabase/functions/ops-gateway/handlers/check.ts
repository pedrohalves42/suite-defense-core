/**
 * Check/monitoring inlined handlers (migrated from check-router)
 * Sub-batch 2C-1: Simple DB-only handlers added
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { withTimeout } from '../../_shared/timeout.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';

type SB = any;

// ═══════════════════════════════════════════════════════════════
// EXISTING HANDLERS (Phase 2C original)
// ═══════════════════════════════════════════════════════════════

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
  const alerts: any[] = [];
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

// ═══════════════════════════════════════════════════════════════
// SUB-BATCH 2C-1: Simple DB-only handlers
// ═══════════════════════════════════════════════════════════════

export async function handleGetInstallationPipelineMetrics(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { error: 'tenant_id required in payload' };

  let hoursBack = payload.hours_back as number | null ?? null;
  if (hoursBack !== null && (isNaN(hoursBack) || hoursBack < 1 || hoursBack > 720)) {
    return { success: false, error: 'Invalid hours_back parameter. Must be between 1 and 720.', request_id: requestId };
  }

  logger.info(`[${requestId}] Fetching pipeline metrics for tenant ${tenantId}, hours_back: ${hoursBack ?? 'all time'}`);

  const { data: metrics, error: metricsError } = await supabase
    .rpc('calculate_pipeline_metrics', { p_tenant_id: tenantId, p_hours_back: hoursBack });

  if (metricsError) {
    logger.error(`[${requestId}] Error calling calculate_pipeline_metrics:`, metricsError);
    throw metricsError;
  }

  const result = metrics && metrics.length > 0 ? metrics[0] : {
    total_generated: 0, total_downloaded: 0, total_command_copied: 0,
    total_installed: 0, total_active: 0, total_stuck: 0,
    success_rate_pct: 0, avg_install_time_seconds: 0,
    conversion_rate_generated_to_installed_pct: 0, conversion_rate_copied_to_installed_pct: 0,
  };

  return { success: true, metrics: result, request_id: requestId, tenant_id: tenantId, hours_back: hoursBack ?? 'all' };
}

interface SilentJob { id: string; tenant_id: string | null; job_name: string; cron_expression: string | null; last_run_at: string | null; next_run_at: string | null; status: string | null; enabled: boolean | null; }

function deriveHealthStatus(job: any): 'OK' | 'NEVER_RAN' | 'STALE' {
  const lastRunAt = job.last_executed_at || job.last_run_at;
  if (!lastRunAt) return 'NEVER_RAN';
  if (job.next_run_at) { const nextRun = new Date(job.next_run_at).getTime(); if (nextRun < Date.now() - 10 * 60 * 1000) return 'STALE'; }
  if (job.silence_duration && job.expected_interval) {
    if (job.silence_duration > job.expected_interval * 1.5) return 'STALE';
  }
  return 'OK';
}

export async function handleCronSentinel(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startTime = Date.now();
  logger.info(`[${requestId}] cron-sentinel started`);

  const { data: silentJobs, error: queryError } = await supabase.from('v_cron_silent_failures').select('job_key, last_executed_at, expected_interval, silence_duration, severity');
  if (queryError) throw queryError;

  const allJobs = (silentJobs || []) as SilentJob[];
  const unhealthyJobs = allJobs.filter(job => job.enabled !== false).filter(job => deriveHealthStatus(job) !== 'OK');
  logger.info(`[${requestId}] Checked ${allJobs.length} jobs, found ${unhealthyJobs.length} unhealthy`);

  if (unhealthyJobs.length === 0) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'cron-sentinel', p_success: true, p_duration_ms: Date.now() - startTime, p_result: { message: 'All jobs healthy', jobs_checked: allJobs.length }, p_processed_count: 0, p_job_source: 'cron' });
    await supabase.rpc('update_cron_health', { p_cron_name: 'cron-sentinel', p_success: true, p_error: null });
    return { success: true, message: 'All cron jobs healthy', jobs_checked: allJobs.length, silent_jobs: 0 };
  }

  const { data: existingTask } = await supabase.from('tasks').select('id').eq('source_type', 'system_alert').like('title', '%Cron Jobs Silent Failure%').in('status', ['open', 'in_progress']).gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()).limit(1);
  if (existingTask && existingTask.length > 0) return { success: true, message: 'Alert task already exists', existing_task_id: existingTask[0].id, silent_jobs: unhealthyJobs.length };

  const { data: runbook } = await supabase.from('runbooks').select('id, title, steps').eq('anomaly_type', 'cron_silent_failure').single();
  const jobNames = unhealthyJobs.map((j: any) => j.job_key || j.job_name).slice(0, 10).join(', ');
  const moreCount = unhealthyJobs.length > 10 ? ` (+${unhealthyJobs.length - 10} more)` : '';

  const { data: task, error: taskError } = await supabase.from('tasks').insert({
    tenant_id: (unhealthyJobs[0] as any)?.tenant_id || null, source_type: 'system_alert',
    title: `⚠ Cron Jobs Silent Failure - ${unhealthyJobs.length} jobs`,
    description: `Jobs sem execucao detectados: ${jobNames}${moreCount}. Consulte o Runbook INC-CRON-001.`,
    severity: 'critical', status: 'open', auto_generated: true,
    metadata: { silent_jobs: unhealthyJobs.map((j: any) => ({ name: j.job_key || j.job_name, status: deriveHealthStatus(j), last_run_at: j.last_executed_at || j.last_run_at, next_run_at: j.next_run_at, cron_expression: j.cron_expression })), runbook_id: runbook?.id || null, runbook_title: runbook?.title || 'INC-CRON-001', detected_at: new Date().toISOString(), sentinel_run_id: requestId }
  }).select('id').single();

  if (taskError) throw taskError;
  logger.info(`[${requestId}] Created P0 task: ${task?.id}`);

  await supabase.from('audit_logs').insert({ action: 'CRON_SILENT_FAILURE_DETECTED', resource_type: 'scheduled_jobs', details: { silent_jobs_count: unhealthyJobs.length, task_id: task?.id, sentinel_run: requestId, jobs: unhealthyJobs.map(j => j.job_name) }, severity: 'critical' });

  const duration = Date.now() - startTime;
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'cron-sentinel', p_success: true, p_duration_ms: duration, p_result: { silent_jobs: unhealthyJobs.length, task_created: task?.id }, p_processed_count: unhealthyJobs.length, p_job_source: 'cron' });
  await supabase.rpc('update_cron_health', { p_cron_name: 'cron-sentinel', p_success: true, p_error: null });

  return { success: true, message: 'Alert created for silent cron jobs', task_id: task?.id, silent_jobs: unhealthyJobs.length, duration_ms: duration };
}

interface StuckJob {
  id: string; agent_name: string; type: string; delivered_at: string; tenant_id: string; minutes_stuck: number;
}

function getZombieThresholdMinutes(jobType: string): number {
  if (jobType === 'health_check' || jobType === 'config') return 15;
  if (jobType.startsWith('collect_') || jobType === 'light_vuln_scan' || jobType === 'integration_test_v3') return 30;
  if (jobType === 'software_inventory_collect' || jobType === 'disk_cleanup') return 60;
  if (jobType === 'update_agent' || jobType === 'apply_security_patch' || jobType === 'reinstall_agent') return 120;
  return 45;
}

export async function handleCheckStuckJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  logger.info(`[${requestId}] Starting stuck jobs check (adaptive thresholds)`);

  const { data: deliveredJobs, error: fetchError } = await supabase
    .from('jobs').select('id, agent_name, type, delivered_at, tenant_id').eq('status', 'delivered');

  if (fetchError) throw fetchError;

  if (!deliveredJobs || deliveredJobs.length === 0) {
    return { success: true, stuck_jobs: 0, alerts_created: 0, auto_failed: 0, timestamp: new Date().toISOString() };
  }

  const stuckJobs: StuckJob[] = [];
  const autoFailIds: string[] = [];

  for (const job of deliveredJobs) {
    const minutesStuck = Math.floor((Date.now() - new Date(job.delivered_at).getTime()) / (1000 * 60));
    const threshold = getZombieThresholdMinutes(job.type);
    if (minutesStuck >= threshold) {
      stuckJobs.push({ ...job, minutes_stuck: minutesStuck });
      if (minutesStuck >= threshold * 2) autoFailIds.push(job.id);
    }
  }

  let autoFailedCount = 0;
  if (autoFailIds.length > 0) {
    const { count } = await supabase
      .from('jobs')
      .update({ status: 'failed', error_message: 'ZOMBIE_AUTO_FAILED: exceeded 2x zombie threshold', completed_at: new Date().toISOString() })
      .in('id', autoFailIds).eq('status', 'delivered');
    autoFailedCount = count || autoFailIds.length;
  }

  if (stuckJobs.length === 0) {
    return { success: true, stuck_jobs: 0, alerts_created: 0, auto_failed: autoFailedCount, timestamp: new Date().toISOString() };
  }

  const jobsByTenant: Record<string, StuckJob[]> = {};
  for (const job of stuckJobs) {
    if (!jobsByTenant[job.tenant_id]) jobsByTenant[job.tenant_id] = [];
    jobsByTenant[job.tenant_id].push(job);
  }

  let alertsCreated = 0;
  for (const [tenantId, jobs] of Object.entries(jobsByTenant)) {
    const maxMinutesStuck = Math.max(...jobs.map(j => j.minutes_stuck));
    const severity = maxMinutesStuck >= 120 ? 'critical' : maxMinutesStuck >= 60 ? 'high' : 'medium';
    const { error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: tenantId, alert_type: 'stuck_jobs', severity,
      message: `${jobs.length} job(s) travado(s)`,
      metadata: {
        job_count: jobs.length, max_minutes_stuck: maxMinutesStuck,
        auto_failed: autoFailIds.filter(id => jobs.some(j => j.id === id)).length,
        jobs: jobs.slice(0, 10).map(j => ({ id: j.id, type: j.type, agent_name: j.agent_name, minutes_stuck: j.minutes_stuck, threshold: getZombieThresholdMinutes(j.type) })),
      },
    });
    if (!alertError) alertsCreated++;
  }

  const result = {
    success: true, stuck_jobs: stuckJobs.length, auto_failed: autoFailedCount,
    tenants_affected: Object.keys(jobsByTenant).length, alerts_created: alertsCreated,
    timestamp: new Date().toISOString(),
  };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-stuck-jobs', p_success: true,
    p_duration_ms: Date.now() - startedAt, p_result: result,
    p_processed_count: stuckJobs.length, p_job_source: 'cron',
  });

  return result;
}

interface StuckBuild { id: string; github_run_id: string | null; created_at: string; }

export async function handleBuildWatchdog(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const GITHUB_TOKEN = Deno.env.get('BUILD_GH_TOKEN')!;
  const GITHUB_REPO = Deno.env.get('BUILD_GH_REPOSITORY')!;

  logger.info(`[build-watchdog][${requestId}] Starting watchdog check`);

  return await withTimeout(async () => {
    const { data: stuckBuilds, error: queryError } = await supabase
      .from('agent_builds').select('id, github_run_id, created_at')
      .eq('build_status', 'building')
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (queryError) throw queryError;

    if (!stuckBuilds || stuckBuilds.length === 0) {
      logger.info(`[build-watchdog][${requestId}] No stuck builds found`);
      return { success: true, checked_builds: 0, message: 'No stuck builds detected', requestId, timestamp: new Date().toISOString() };
    }

    logger.info(`[build-watchdog][${requestId}] Found ${stuckBuilds.length} potentially stuck builds`);
    const results = [];

    for (const build of stuckBuilds) {
      let shouldFail = false;
      let reason = 'Unknown';

      if (!build.github_run_id) {
        shouldFail = true;
        reason = 'No GitHub run ID - likely failed before workflow started';
      } else {
        try {
          const ghResponse = await fetchWithTimeout(
            `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${build.github_run_id}`,
            { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } }
          );

          if (ghResponse.ok) {
            const ghData = await ghResponse.json();
            if (ghData.status === 'completed' && ghData.conclusion !== 'success') {
              shouldFail = true;
              reason = `GitHub workflow ${ghData.conclusion}`;
            } else if (ghData.status === 'completed' && ghData.conclusion === 'success') {
              shouldFail = true;
              reason = 'GitHub workflow succeeded but callback never received';
            }
          } else if (ghResponse.status === 404) {
            shouldFail = true;
            reason = 'GitHub workflow not found (deleted or never existed)';
          }
        } catch (ghError) {
          logger.error(`[build-watchdog][${requestId}] GitHub API error for build ${build.id}`, ghError);
        }
      }

      if (shouldFail) {
        const { error: updateError } = await supabase
          .from('agent_builds')
          .update({ build_status: 'failed', build_completed_at: new Date().toISOString(), error_message: `Build watchdog: ${reason}` })
          .eq('id', build.id);
        results.push({ build_id: build.id, action: 'marked_failed', reason, error: updateError?.message || null });
      }
    }

    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'build-watchdog', p_success: true, p_duration_ms: Date.now() - startedAt,
      p_result: { checked_builds: stuckBuilds.length, marked_failed: results.length },
      p_processed_count: stuckBuilds.length, p_job_source: 'cron'
    });

    return { success: true, checked_builds: stuckBuilds.length, marked_failed: results.length, results, requestId, timestamp: new Date().toISOString() };
  }, { timeoutMs: 25000 });
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round((sorted[Math.max(0, idx)] || 0) * 100) / 100;
}

export async function handleCalculateBehavioralBaselines(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startTime = Date.now();
  logger.info(`[${requestId}] Starting baseline calculation...`);

  const { data: agents, error: agentsError } = await supabase
    .from('agents_safe').select('id, tenant_id, agent_name').is('archived_at', null).eq('status', 'active');

  if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`);
  if (!agents || agents.length === 0) return { message: 'No active agents', processed: 0 };

  logger.info(`[${requestId}] Processing ${agents.length} agents`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let processedCount = 0;
  let errorCount = 0;

  for (const agent of agents) {
    try {
      const { data: processData } = await supabase
        .from('agent_processes').select('processes, collected_at')
        .eq('agent_id', agent.id).gte('collected_at', sevenDaysAgo.toISOString())
        .order('collected_at', { ascending: true });

      if (!processData || processData.length < 3) continue;

      const cpuValues: number[] = [];
      const processCountValues: number[] = [];

      for (const snapshot of processData) {
        const processes = snapshot.processes as any[];
        if (Array.isArray(processes)) {
          const totalCpu = processes.reduce((sum: number, p: { cpu_percent?: number; cpu?: number }) => sum + (Number(p.cpu_percent || p.cpu || 0)), 0);
          cpuValues.push(Math.min(totalCpu, 100));
          processCountValues.push(processes.length);
        }
      }

      for (const { type, values } of [{ type: 'cpu_usage', values: cpuValues }, { type: 'process_count', values: processCountValues }]) {
        if (values.length < 3) continue;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const baselinePayload = {
          agent_id: agent.id, tenant_id: agent.tenant_id, baseline_type: type,
          mean_value: Math.round(mean * 100) / 100, std_deviation: Math.round(stdDev * 100) / 100,
          threshold_multiplier: 2.5,
          baseline_data: { sample_count: values.length, min: Math.min(...values), max: Math.max(...values), p50: percentile(values, 50), p90: percentile(values, 90), p99: percentile(values, 99) },
          baseline_period_start: sevenDaysAgo.toISOString(), baseline_period_end: now.toISOString(),
          is_active: true, last_updated: now.toISOString(),
        };

        const { error: upsertError } = await supabase.from('agent_behavioral_baseline').upsert(baselinePayload, { onConflict: 'agent_id,baseline_type', ignoreDuplicates: false });

        if (upsertError) {
          const { data: existing } = await supabase.from('agent_behavioral_baseline').select('id').eq('agent_id', agent.id).eq('baseline_type', type).maybeSingle();
          if (existing) { await supabase.from('agent_behavioral_baseline').update(baselinePayload).eq('id', existing.id); }
          else { await supabase.from('agent_behavioral_baseline').insert(baselinePayload); }
        }
      }
      processedCount++;
    } catch (agentError) {
      logger.error(`[${requestId}] Error processing agent ${agent.agent_name}:`, String(agentError));
      errorCount++;
    }
  }

  const duration = Date.now() - startTime;
  logger.info(`[${requestId}] Complete: ${processedCount} agents processed, ${errorCount} errors, ${duration}ms`);
  return { success: true, processed: processedCount, errors: errorCount, duration_ms: duration };
}

export async function handleComputeComplianceBenchmarks(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  logger.info(`[${requestId}] Computing benchmarks for period ${periodMonth}`);

  const { data: tenants } = await supabase.from('tenant_subscriptions').select('tenant_id').in('status', ['active', 'trialing']);
  if (!tenants?.length) return { message: 'No active tenants' };

  const tenantIds = [...new Set(tenants.map(t => t.tenant_id))];
  const scores: number[] = [];
  const categoryScores: Record<string, number[]> = {};

  for (const tenantId of tenantIds) {
    const score = await _calculateTenantComplianceScore(supabase, tenantId);
    if (score !== null) {
      scores.push(score.overall);
      for (const [cat, val] of Object.entries(score.categories)) {
        if (!categoryScores[cat]) categoryScores[cat] = [];
        categoryScores[cat].push(val as number);
      }
    }
  }

  if (scores.length === 0) return { message: 'No scores computed' };

  scores.sort((a, b) => a - b);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const median = scores.length % 2 === 0 ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2 : scores[Math.floor(scores.length / 2)];

  const catAvg: Record<string, number> = {};
  for (const [cat, vals] of Object.entries(categoryScores)) {
    catAvg[cat] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  await supabase.from('compliance_benchmarks').upsert({
    industry_segment: 'all', period_month: periodMonth,
    avg_score: Math.round(avg * 10) / 10, median_score: Math.round(median * 10) / 10,
    min_score: Math.round(scores[0] * 10) / 10, max_score: Math.round(scores[scores.length - 1] * 10) / 10,
    tenant_count: scores.length, category_averages: catAvg,
  }, { onConflict: 'industry_segment,period_month' });

  const result = { period: periodMonth, tenant_count: scores.length, avg_score: Math.round(avg * 10) / 10, median_score: Math.round(median * 10) / 10, min_score: Math.round(scores[0] * 10) / 10, max_score: Math.round(scores[scores.length - 1] * 10) / 10, categories: catAvg };
  logger.info(`[${requestId}] Success:`, result);
  return result;
}

async function _calculateTenantComplianceScore(supabase: SB, tenantId: string): Promise<{ overall: number; categories: Record<string, number> } | null> {
  try {
    const categories: Record<string, number> = {};
    const { data: agents } = await supabase.from('agents').select('id, status').eq('tenant_id', tenantId);
    const totalAgents = agents?.length || 0;
    const activeAgents = agents?.filter((a: Record<string, unknown>) => a.status === 'active').length || 0;
    categories['agent_coverage'] = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;

    const { data: alerts } = await supabase.from('system_alerts').select('id, acknowledged').eq('tenant_id', tenantId).limit(100);
    const totalAlerts = alerts?.length || 0;
    categories['alert_response'] = totalAlerts > 0 ? Math.round((alerts?.filter((a: Record<string, unknown>) => a.acknowledged).length || 0) / totalAlerts * 100) : 100;

    const { data: jobs } = await supabase.from('jobs').select('id, status').eq('tenant_id', tenantId).limit(500);
    const totalJobs = jobs?.length || 0;
    categories['job_reliability'] = totalJobs > 0 ? Math.round((jobs?.filter((j: Record<string, unknown>) => j.status === 'completed').length || 0) / totalJobs * 100) : 0;

    const { count: evidenceCount } = await supabase.from('agent_evidence_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    categories['evidence_coverage'] = Math.min(100, Math.round(((evidenceCount || 0) / 50) * 100));

    const { count: threatCount } = await supabase.from('threat_indicators').select('id', { count: 'exact', head: true }).eq('is_active', true);
    categories['threat_intelligence'] = (threatCount || 0) > 0 ? 100 : 0;

    const weights: Record<string, number> = { agent_coverage: 0.25, alert_response: 0.20, job_reliability: 0.20, evidence_coverage: 0.20, threat_intelligence: 0.15 };
    let overall = 0;
    for (const [cat, weight] of Object.entries(weights)) overall += (categories[cat] || 0) * weight;
    return { overall: Math.round(overall), categories };
  } catch (error) { logger.error(`[compute-compliance-benchmarks] Error for tenant ${tenantId}:`, error); return null; }
}

export async function handleCheckPendingAgents(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[${requestId}] Starting check-pending-agents...`);

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: agents, error: agentsError } = await supabase
    .from('agents').select('id, agent_name, enrolled_at, tenant_id, last_heartbeat')
    .is('last_heartbeat', null).lt('enrolled_at', tenMinutesAgo)
    .order('enrolled_at', { ascending: false }).limit(100);

  if (agentsError) throw agentsError;
  if (!agents || agents.length === 0) return { success: true, message: 'No pending agents', count: 0 };

  logger.info(`[${requestId}] Found ${agents.length} agents without heartbeat`);

  const agentIds = agents.map(a => a.id);
  const { data: installations } = await supabase.from('installation_analytics').select('agent_id').in('agent_id', agentIds).eq('event_type', 'post_installation');
  const installedAgentIds = new Set(installations?.map(i => i.agent_id) || []);
  const notInstalledAgents = agents.filter(a => !installedAgentIds.has(a.id));

  if (notInstalledAgents.length === 0) return { success: true, message: 'All agents have installation events', count: 0 };

  interface PendingAgent { id: string; agent_name: string; enrolled_at: string; tenant_id: string; last_heartbeat: string | null; }

  const tenantGroups = notInstalledAgents.reduce((acc, agent) => {
    if (!acc[agent.tenant_id]) acc[agent.tenant_id] = [];
    acc[agent.tenant_id].push(agent);
    return acc;
  }, {} as Record<string, PendingAgent[]>);

  const notifications: any[] = [];

  // Lazy import Resend
  const { Resend } = await import('https://esm.sh/resend@4.0.0');
  const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

  for (const [tenantId, agentsList] of Object.entries(tenantGroups)) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await supabase.from('system_alerts').select('id').eq('tenant_id', tenantId).eq('alert_type', 'pending_agents').gte('created_at', oneHourAgo).maybeSingle();
    if (recentAlert) continue;

    const { data: tenant } = await supabase.from('tenants').select('name, owner_user_id').eq('id', tenantId).single();
    const { data: adminUsers } = await supabase.from('user_roles').select('user_id, profiles!inner(full_name)').eq('tenant_id', tenantId).eq('role', 'admin');

    const adminEmails: string[] = [];
    if (adminUsers) {
      for (const admin of adminUsers) {
        const { data: authUser } = await supabase.auth.admin.getUserById(admin.user_id);
        if (authUser.user?.email) adminEmails.push(authUser.user.email);
      }
    }

    const agentsPending30Min = agentsList.filter(a => (Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60 >= 30);

    const { data: insertedAlert, error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: tenantId, alert_type: 'pending_agents',
      severity: agentsPending30Min.length > 0 ? 'high' : 'medium',
      title: `${agentsList.length} agente(s) pendente(s) de instalacao`,
      message: `Agentes pendentes: ${agentsList.map(a => a.agent_name).join(', ')}`,
      details: { agents: agentsList.map(a => ({ id: a.id, name: a.agent_name, enrolled_at: a.enrolled_at, minutes_pending: Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60) })), recommendation: 'Verifique se os instaladores foram executados corretamente.' },
      acknowledged: false, resolved: false
    }).select().single();

    if (!alertError) {
      notifications.push({ tenant_id: tenantId, agents_count: agentsList.length, agents: agentsList.map(a => a.agent_name) });

      if (agentsPending30Min.length > 0 && adminEmails.length > 0) {
        const agentList = agentsPending30Min.map(a => `• ${a.agent_name} (pendente ha ${Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60)} minutos)`).join('\n');
        try {
          await resend.emails.send({
            from: 'CyberShield Alerts <alerts@resend.dev>', to: adminEmails,
            subject: `[WARN] ${agentsPending30Min.length} agente(s) pendente(s) ha mais de 30 minutos`,
            html: `<h1>Alerta: Agentes Pendentes de Instalacao</h1><pre style="background:#f5f5f5;padding:15px">${agentList}</pre><p>Acesse o painel para detalhes.</p>`
          });
          await supabase.from('system_alerts').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', insertedAlert.id);
        } catch (emailError) { logger.error(`[${requestId}] Error sending email:`, emailError); }
      }
    }
  }

  return { success: true, message: `Checked ${agents.length} agents, created ${notifications.length} alerts`, total_agents: agents.length, not_installed: notInstalledAgents.length, notifications };
}
