/**
 * Sync Jobs handlers (Batch 3B) — jobs, DLQ, scheduling
 * Inlined from: process-failed-jobs, process-scheduled-jobs, invoke-scheduled-jobs, dlq-action, process-dlq-retries
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger, loggerWithContext } from '../../_shared/logger.ts';
import { getDLQEntriesForRetry, calculateNextRetry } from '../../_shared/dlq.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';

type SB = ReturnType<typeof createClient>;

// ── process-failed-jobs ──────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRYABLE_CLASSES = ['TRANSIENT'];
const DLQ_CLASSES = ['AGENT_OFFLINE', 'AGENT_STALLED', 'AGENT_INCOMPATIBLE', 'CASCADE_FAILURE', 'BUG', 'POLICY', 'SECURITY'];

export async function handleProcessFailedJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const results = { processed: 0, retried: 0, sentToDlq: 0, alertsCreated: 0, exhausted: 0, byClass: {} as Record<string, number>, errors: [] as string[] };

  const { data: failedJobs, error: fetchError } = await supabase
    .from('jobs')
    .select('id, tenant_id, agent_id, agent_name, type, payload, status, approved, error_message, retry_count, failure_class')
    .eq('status', 'failed').lt('retry_count', MAX_RETRIES)
    .order('completed_at', { ascending: true }).limit(50);

  if (fetchError) throw new Error(`Failed to fetch failed jobs: ${fetchError.message}`);
  if (!failedJobs || failedJobs.length === 0) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-failed-jobs', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { message: 'No failed jobs' }, p_processed_count: 0, p_job_source: 'cron' });
    return { success: true, ...results };
  }

  for (const job of failedJobs) {
    results.processed++;
    const currentRetry = (job.retry_count || 0) + 1;
    const failureClass = job.failure_class || 'BUG';
    results.byClass[failureClass] = (results.byClass[failureClass] || 0) + 1;

    try {
      const shouldRetry = RETRYABLE_CLASSES.includes(failureClass) && currentRetry < MAX_RETRIES;
      const shouldDlq = DLQ_CLASSES.includes(failureClass) || currentRetry >= MAX_RETRIES;

      if (shouldDlq) {
        results.sentToDlq++;
        if (currentRetry >= MAX_RETRIES) results.exhausted++;

        if (failureClass !== 'EXPECTED_DROP') {
          const { error: alertError } = await supabase.from('system_alerts').insert({
            tenant_id: job.tenant_id, agent_id: job.agent_id, alert_type: 'job_failure_dlq',
            severity: failureClass === 'SECURITY' ? 'critical' : 'high',
            message: `Job "${job.type}" enviado para DLQ: ${failureClass}`,
            metadata: { job_id: job.id, job_type: job.type, agent_name: job.agent_name, failure_class: failureClass, last_error: job.error_message, retry_count: currentRetry },
            resolved: false,
          });
          if (!alertError) results.alertsCreated++;
        }

        await supabase.from('failed_jobs_dlq').upsert({
          original_job_id: job.id, tenant_id: job.tenant_id, agent_id: job.agent_id, agent_name: job.agent_name,
          job_type: job.type, payload: job.payload, error_count: currentRetry, retry_count: currentRetry,
          max_retries: MAX_RETRIES, status: 'dlq', last_error: job.error_message, failure_class: failureClass,
          failed_at: new Date().toISOString(),
        }, { onConflict: 'original_job_id' });

        await supabase.from('jobs').update({ retry_count: MAX_RETRIES, error_message: `[DLQ:${failureClass}] ${job.error_message || 'Sent to DLQ'}` }).eq('id', job.id);

      } else if (shouldRetry) {
        const { error: createError } = await supabase.from('jobs').insert({
          tenant_id: job.tenant_id, agent_id: job.agent_id, agent_name: job.agent_name,
          type: job.type, payload: job.payload, status: 'queued', approved: job.approved,
          retry_count: currentRetry, parent_job_id: job.id,
        });
        if (createError) throw new Error(`Failed to create retry job: ${createError.message}`);
        await supabase.from('jobs').update({ retry_count: currentRetry, error_message: `[RETRY ${currentRetry}/${MAX_RETRIES}] ${job.error_message || 'Unknown error'}` }).eq('id', job.id);
        results.retried++;
      }
    } catch (err) {
      results.errors.push(`Job ${job.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-failed-jobs', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: results, p_processed_count: results.processed, p_job_source: 'cron' });
  return { success: true, ...results };
}

// ── process-scheduled-jobs ───────────────────────────────────────────────

const JOB_TTL_HOURS: Record<string, number> = {
  collect_antivirus_status: 1, software_inventory_collect: 1, collect_web_activity: 1,
  light_vuln_scan: 1, collect_network_info: 1, collect_certificates: 1,
  collect_disk_metrics: 1, service_health_check: 1, network_diagnostics: 1,
};
const getTtlForType = (type: string): number => JOB_TTL_HOURS[type] ?? 4;

export async function handleProcessScheduledJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  let processedCount = 0;
  let createdRecurringCount = 0;

  const { data: scheduledJobs, error: scheduledError } = await supabase
    .from('jobs')
    .select(`*, agent:agents!jobs_agent_id_fkey(id, last_heartbeat, status, scheduling_paused)`)
    .eq('status', 'queued').eq('is_recurring', false)
    .not('scheduled_at', 'is', null).lte('scheduled_at', now).limit(100);

  if (scheduledError) throw scheduledError;

  let skippedOneTimeOffline = 0;
  if (scheduledJobs && scheduledJobs.length > 0) {
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const onlineJobIds: string[] = [];
    const offlineJobIds: string[] = [];

    for (const job of scheduledJobs) {
      const agent = job.agent;
      const isOnline = agent && agent.status === 'active' && !agent.scheduling_paused && agent.last_heartbeat && new Date(agent.last_heartbeat) > onlineThreshold;
      if (isOnline) onlineJobIds.push(job.id);
      else { offlineJobIds.push(job.id); skippedOneTimeOffline++; }
    }

    if (onlineJobIds.length > 0) {
      const { error: updateError } = await supabase.from('jobs').update({ status: 'queued', scheduled_at: null }).in('id', onlineJobIds);
      if (!updateError) processedCount = onlineJobIds.length;
    }

    if (offlineJobIds.length > 0) {
      await supabase.from('jobs').update({ status: 'failed', error_message: '[DLQ:AGENT_OFFLINE] Scheduled job skipped: agent offline at execution time', completed_at: now }).in('id', offlineJobIds).lt('expires_at', now);
    }
  }

  // Recurring jobs
  const { data: recurringJobs, error: recurringError } = await supabase
    .from('jobs')
    .select(`*, agent:agents!jobs_agent_id_fkey(id, last_heartbeat, status, scheduling_paused)`)
    .eq('is_recurring', true).eq('approved', true)
    .not('next_run_at', 'is', null).lte('next_run_at', now).limit(50);

  if (recurringError) throw recurringError;

  let skippedOfflineCount = 0;
  if (recurringJobs && recurringJobs.length > 0) {
    for (const recurringJob of recurringJobs) {
      try {
        const agent = recurringJob.agent;
        const isOnline = agent && agent.status === 'active' && !agent.scheduling_paused && agent.last_heartbeat && new Date(agent.last_heartbeat) > new Date(Date.now() - 2 * 60 * 60 * 1000);

        if (!isOnline) {
          skippedOfflineCount++;
          const { data: nextRunData } = await supabase.rpc('calculate_next_run', { pattern: recurringJob.recurrence_pattern, from_time: now });
          if (nextRunData) await supabase.from('jobs').update({ next_run_at: nextRunData }).eq('id', recurringJob.id);
          continue;
        }

        const { data: nextRunData, error: nextRunError } = await supabase.rpc('calculate_next_run', { pattern: recurringJob.recurrence_pattern, from_time: now });
        if (nextRunError) continue;

        const { error: insertError } = await supabase.rpc('create_job_if_not_exists', {
          p_agent_id: recurringJob.agent_id, p_tenant_id: recurringJob.tenant_id,
          p_type: recurringJob.type, p_payload: recurringJob.payload || {},
          p_priority: recurringJob.priority || 5, p_ttl_hours: getTtlForType(recurringJob.type)
        });
        if (insertError) continue;

        await supabase.from('jobs').update({ last_run_at: now, next_run_at: nextRunData }).eq('id', recurringJob.id);
        createdRecurringCount++;
      } catch (error) { logger.error(`[${requestId}] Error processing recurring job ${recurringJob.id}:`, error); }
    }
  }

  const result = {
    success: true, processedScheduled: processedCount, createdRecurring: createdRecurringCount,
    skippedOffline: skippedOfflineCount + skippedOneTimeOffline,
    skippedRecurringOffline: skippedOfflineCount, skippedScheduledOffline: skippedOneTimeOffline, timestamp: now
  };

  const duration = Date.now() - new Date(now).getTime();
  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'process-scheduled-jobs', p_success: true,
      p_duration_ms: duration > 0 ? duration : 1, p_result: result,
      p_processed_count: processedCount + createdRecurringCount, p_job_source: 'cron'
    });
  } catch (logErr) { logger.error(`[${requestId}] Failed to log cron health:`, logErr); }

  return result;
}

// ── invoke-scheduled-jobs ────────────────────────────────────────────────

export async function handleInvokeScheduledJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();

  // KILL SWITCH CHECK (ADR-FINAL)
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    return { success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' };
  }

  const now = new Date();
  const results: Array<{ name: string; job_type: string; status: 'executed' | 'skipped' | 'error'; message?: string }> = [];

  const { data: scheduledJobs, error: fetchError } = await supabase
    .from('scheduled_jobs').select('id, name, job_type, schedule_cron, tenant_id, config, enabled, last_run_at, next_run_at').eq('enabled', true);

  if (fetchError) throw fetchError;

  const jobTypeToFunction: Record<string, string> = {
    'edge_function': '',
    'autonomous_safe_mode': 'autonomous-safe-mode',
    'auto_cleanup': 'ops-gateway',
    'auto_execute_ai': 'auto-execute-ai-actions',
    'watchdog_non_execution': 'watchdog-non-execution',
    'ai_system_analyzer': 'ai-system-analyzer',
    'integrity_sentinel': 'integrity-sentinel',
    'scheduled_reports': 'scheduled-report-generator',
    'executive_report': 'generate-executive-report',
    'detect_blocked_attempts': 'detect-blocked-attempts',
    'ai_insight_generator': 'ai-router',
    'scan_vulnerabilities': 'scan-vulnerabilities',
    'monitor_thresholds': 'monitor-thresholds',
    'cron_sentinel': 'cron-sentinel',
    'ai-full-audit': 'ai-full-audit',
    'ai-red-team-assessment': 'ai-red-team-assessment',
    'generate-weekly-report': 'generate-weekly-report',
  };

  const nameToFunction: Record<string, string> = {
    'Autonomous SAFE_MODE': 'autonomous-safe-mode',
    'Auto Cleanup Jobs': 'ops-gateway',
    'Auto Execute AI Actions': 'auto-execute-ai-actions',
    'Watchdog Non-Execution': 'watchdog-non-execution',
    'AI System Analyzer': 'ai-system-analyzer',
    'Integrity Sentinel': 'integrity-sentinel',
    'Scheduled Report Generator': 'scheduled-report-generator',
    'Executive Report': 'generate-executive-report',
    'Detect Blocked Attempts': 'detect-blocked-attempts',
    'AI Insight Generator': 'ai-router',
  };

  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

  for (const job of scheduledJobs || []) {
    try {
      let functionName = jobTypeToFunction[job.job_type];
      if (!functionName && job.job_type === 'edge_function') {
        functionName = nameToFunction[job.name] || '';
      }

      if (!functionName) {
        results.push({ name: job.name, job_type: job.job_type, status: 'skipped', message: 'No function mapping' });
        continue;
      }

      if (job.next_run_at && new Date(job.next_run_at) > now) {
        results.push({ name: job.name, job_type: job.job_type, status: 'skipped', message: `Not due until ${job.next_run_at}` });
        continue;
      }

      const basePayload = { scheduled_job_id: job.id, tenant_id: job.tenant_id, triggered_by: 'scheduled' };

      // Route through ops-gateway for cleanup
      const isOpsGateway = functionName === 'ops-gateway';
      const isAiRouter = functionName === 'ai-router';
      const aiActionMap: Record<string, string> = { 'ai_insight_generator': 'get-insights', 'AI Insight Generator': 'get-insights' };

      let invokeBody: Record<string, unknown>;
      if (isOpsGateway) {
        invokeBody = { action: 'cleanup:auto-cleanup-jobs', payload: basePayload };
      } else if (isAiRouter) {
        invokeBody = { action: aiActionMap[job.job_type] || aiActionMap[job.name] || 'get-insights', payload: basePayload };
      } else {
        invokeBody = basePayload;
      }

      const { error: invokeError } = await supabase.functions.invoke(functionName, {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET || '' },
        body: invokeBody,
      });

      if (invokeError) {
        results.push({ name: job.name, job_type: job.job_type, status: 'error', message: invokeError.message });
        continue;
      }

      const nextRunAt = calculateNextRunFromCron(job.cron_expr, now);
      await supabase.from('scheduled_jobs').update({
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt?.toISOString() || null
      }).eq('id', job.id);

      results.push({ name: job.name, job_type: job.job_type, status: 'executed', message: 'Success' });
    } catch (jobError) {
      results.push({ name: job.name, job_type: job.job_type, status: 'error', message: jobError instanceof Error ? jobError.message : 'Unknown error' });
    }
  }

  const durationMs = Date.now() - startedAt;
  const summary = {
    success: true,
    total_jobs: scheduledJobs?.length || 0,
    executed: results.filter(r => r.status === 'executed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
    timestamp: now.toISOString(),
    duration_ms: durationMs
  };

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'invoke-scheduled-jobs', p_success: true, p_duration_ms: durationMs,
      p_result: { total_jobs: summary.total_jobs, executed: summary.executed, skipped: summary.skipped, errors: summary.errors },
      p_processed_count: summary.executed, p_job_source: 'cron'
    });
  } catch (logErr) { logger.error(`[${requestId}] Failed to log job run:`, logErr); }

  return summary;
}

function calculateNextRunFromCron(cronExpr: string, from: Date): Date | null {
  try {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return null;
    const [minute, hour] = parts;
    const next = new Date(from);

    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10);
      const currentMinute = next.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
      if (nextMinute >= 60) { next.setHours(next.getHours() + 1); next.setMinutes(nextMinute - 60); }
      else { next.setMinutes(nextMinute); }
      next.setSeconds(0); next.setMilliseconds(0);
      return next;
    }

    if (minute !== '*' && hour.startsWith('*/')) {
      const hourInterval = parseInt(hour.slice(2), 10);
      const targetMinute = parseInt(minute, 10);
      next.setMinutes(targetMinute); next.setSeconds(0); next.setMilliseconds(0);
      if (next <= from) {
        const currentHour = next.getHours();
        const nextHour = Math.ceil((currentHour + 1) / hourInterval) * hourInterval;
        if (nextHour >= 24) { next.setDate(next.getDate() + 1); next.setHours(nextHour - 24); }
        else { next.setHours(nextHour); }
      }
      return next;
    }

    if (!minute.includes('*') && !hour.includes('*')) {
      next.setHours(parseInt(hour, 10)); next.setMinutes(parseInt(minute, 10));
      next.setSeconds(0); next.setMilliseconds(0);
      if (next <= from) next.setDate(next.getDate() + 1);
      return next;
    }

    next.setHours(next.getHours() + 1); next.setMinutes(0); next.setSeconds(0); next.setMilliseconds(0);
    return next;
  } catch { return null; }
}

// ── dlq-action ───────────────────────────────────────────────────────────

export async function handleDlqAction(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const action = payload.action as string;
  const dlqItemId = payload.dlqItemId as string | undefined;
  const dlqItemIds = payload.dlqItemIds as string[] | undefined;
  const resolutionNotes = payload.resolutionNotes as string | undefined;
  const resolutionSource = (payload.resolutionSource as string) || 'human';

  if (!action || !['resolve', 'delete', 'resolve_batch'].includes(action)) {
    return { error: 'Invalid action', status: 400 };
  }

  // Note: in gateway context, userId comes from the auth token validated by assertInternalCaller
  // For DLQ operations, we use service_role which has full access
  const userId = payload.user_id as string | null;

  switch (action) {
    case 'resolve': {
      if (!dlqItemId) return { error: 'Missing dlqItemId' };
      if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5))
        return { error: 'Resolution notes required (min 5 chars)' };

      const { data: item, error: itemError } = await supabase
        .from('failed_jobs_dlq').select('id, tenant_id').eq('id', dlqItemId).maybeSingle();
      if (itemError || !item) return { error: 'DLQ item not found' };

      const { error: updateError } = await supabase.from('failed_jobs_dlq').update({
        status: 'resolved', resolved_at: new Date().toISOString(),
        resolved_by: userId, resolution_notes: resolutionNotes, resolution_source: resolutionSource,
      }).eq('id', dlqItemId);

      if (updateError) return { error: 'Failed to resolve item' };
      return { success: true, dlqItemId };
    }

    case 'resolve_batch': {
      if (!dlqItemIds?.length) return { error: 'Missing dlqItemIds' };
      if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5))
        return { error: 'Resolution notes required (min 5 chars)' };

      const { error: updateError } = await supabase.from('failed_jobs_dlq').update({
        status: 'resolved', resolved_at: new Date().toISOString(),
        resolved_by: userId, resolution_notes: resolutionNotes, resolution_source: resolutionSource,
      }).in('id', dlqItemIds);

      if (updateError) return { error: 'Failed to resolve items' };
      return { success: true, count: dlqItemIds.length };
    }

    case 'delete': {
      if (!dlqItemId) return { error: 'Missing dlqItemId' };

      const { data: item, error: itemError } = await supabase
        .from('failed_jobs_dlq').select('id, tenant_id, status').eq('id', dlqItemId).maybeSingle();
      if (itemError || !item) return { error: 'DLQ item not found' };
      if (!['exhausted', 'resolved'].includes(item.status))
        return { error: 'Can only delete exhausted or resolved items' };

      const { error: deleteError } = await supabase.from('failed_jobs_dlq').delete().eq('id', dlqItemId);
      if (deleteError) return { error: 'Failed to delete item' };
      return { success: true };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ── process-dlq-retries ──────────────────────────────────────────────────

const UNRECOVERABLE_FAILURE_CLASSES = new Set(['BUG', 'EXPIRED', 'UNKNOWN']);
const UNRECOVERABLE_ERROR_PATTERNS = ['Unknown job type', 'EXECUTION_ID_REQUIRED', 'unsupported_version', 'HMAC secret not configured'];

interface DLQEntryRow {
  id: string; original_job_id: string; tenant_id: string; agent_id: string | null;
  agent_name: string; job_type: string; payload: Record<string, unknown> | null;
  error_count: number; retry_count: number; max_retries: number; status: string;
  failure_class: string | null; error_message: string | null; metadata: Record<string, unknown> | null;
}

function isUnrecoverable(entry: DLQEntryRow): string | null {
  if (entry.failure_class && UNRECOVERABLE_FAILURE_CLASSES.has(entry.failure_class))
    return `Unrecoverable failure_class: ${entry.failure_class}`;
  const errorMsg = entry.error_message || '';
  for (const pattern of UNRECOVERABLE_ERROR_PATTERNS) {
    if (errorMsg.includes(pattern)) return `Unrecoverable error pattern: ${pattern}`;
  }
  return null;
}

export async function handleProcessDlqRetries(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const log = loggerWithContext({ requestId });
  const results = { processed: 0, retried: 0, exhausted: 0, skipped_unrecoverable: 0, alertsCreated: 0, errors: [] as string[] };

  try {
    const rawEntries = await getDLQEntriesForRetry(supabase, 20);
    const entries = rawEntries as unknown as DLQEntryRow[];

    if (entries.length === 0) {
      await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-dlq-retries', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { message: 'No DLQ entries' }, p_processed_count: 0, p_job_source: 'cron' });
      return { success: true, requestId, results };
    }

    for (const entry of entries) {
      results.processed++;
      try {
        const unrecoverableReason = isUnrecoverable(entry);
        if (unrecoverableReason) {
          await supabase.from('failed_jobs_dlq').update({
            status: 'exhausted', next_retry_at: null,
            metadata: { ...(entry.metadata || {}), exhausted_reason: unrecoverableReason, exhausted_at: new Date().toISOString() },
          }).eq('id', entry.id);
          results.skipped_unrecoverable++;
          continue;
        }

        await supabase.from('failed_jobs_dlq').update({ status: 'retrying' }).eq('id', entry.id);

        const { error: jobError } = await supabase.from('jobs').insert({
          tenant_id: entry.tenant_id, agent_id: entry.agent_id, agent_name: entry.agent_name,
          type: entry.job_type, payload: entry.payload, status: 'queued', approved: true,
        });

        if (jobError) {
          if (jobError.message?.includes('idx_jobs_dedup_active')) {
            await supabase.from('failed_jobs_dlq').update({ status: 'pending', next_retry_at: calculateNextRetry(entry.retry_count + 1) }).eq('id', entry.id);
            continue;
          }
          throw new Error(`Failed to recreate job: ${jobError.message}`);
        }

        const newRetryCount = (entry.retry_count || 0) + 1;
        const maxRetries = entry.max_retries || 3;
        const exhausted = newRetryCount >= maxRetries;

        if (exhausted) {
          await supabase.from('failed_jobs_dlq').update({ status: 'exhausted', retry_count: newRetryCount, next_retry_at: null }).eq('id', entry.id);
          results.exhausted++;
          const { error: alertError } = await supabase.from('system_alerts').insert({
            tenant_id: entry.tenant_id, agent_id: entry.agent_id, alert_type: 'dlq_exhausted', severity: 'critical',
            message: `Job "${entry.job_type}" falhou permanentemente apos ${maxRetries} tentativas para ${entry.agent_name}`,
            metadata: { dlq_id: entry.id, original_job_id: entry.original_job_id, job_type: entry.job_type, agent_name: entry.agent_name, retry_count: newRetryCount },
            resolved: false,
          });
          if (!alertError) results.alertsCreated++;
        } else {
          await supabase.from('failed_jobs_dlq').update({ status: 'pending', retry_count: newRetryCount, next_retry_at: calculateNextRetry(newRetryCount) }).eq('id', entry.id);
          results.retried++;
        }
      } catch (err) {
        results.errors.push(`${entry.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
        await supabase.from('failed_jobs_dlq').update({ status: 'pending' }).eq('id', entry.id);
      }
    }

    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-dlq-retries', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: results, p_processed_count: results.processed, p_job_source: 'cron' });
    return { success: true, requestId, results };
  } catch (err) {
    log.error('Unexpected error', err);
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-dlq-retries', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: err instanceof Error ? err.message : 'Unknown', p_result: results, p_processed_count: results.processed, p_job_source: 'cron' });
    throw err;
  }
}
