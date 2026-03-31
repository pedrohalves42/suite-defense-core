/**
 * cron-sentinel → Migrated to serveInternal middleware
 * ADR-FINAL: Runs every 10 minutes to detect cron jobs silent failures.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { recordMetric } from '../_shared/apm.ts';
import { logger } from '../_shared/logger.ts';

interface SilentJob { id: string; tenant_id: string | null; job_name: string; cron_expression: string | null; last_run_at: string | null; next_run_at: string | null; status: string | null; enabled: boolean | null; }

function deriveHealthStatus(job: SilentJob): 'OK' | 'NEVER_RAN' | 'STALE' {
  if (!job.last_run_at) return 'NEVER_RAN';
  if (job.next_run_at) { const nextRun = new Date(job.next_run_at).getTime(); if (nextRun < Date.now() - 10 * 60 * 1000) return 'STALE'; }
  if (job.status && ['failed', 'error', 'stuck'].includes(job.status.toLowerCase())) return 'STALE';
  return 'OK';
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();
  logger.info(`[${requestId}] cron-sentinel started`);

  const { data: silentJobs, error: queryError } = await supabase.from('v_cron_silent_failures').select('*');
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
  const jobNames = unhealthyJobs.map(j => j.job_name).slice(0, 10).join(', ');
  const moreCount = unhealthyJobs.length > 10 ? ` (+${unhealthyJobs.length - 10} more)` : '';

  const { data: task, error: taskError } = await supabase.from('tasks').insert({
    tenant_id: unhealthyJobs[0]?.tenant_id || null, source_type: 'system_alert',
    title: `⚠ Cron Jobs Silent Failure - ${unhealthyJobs.length} jobs`,
    description: `Jobs sem execucao detectados: ${jobNames}${moreCount}. Consulte o Runbook INC-CRON-001.`,
    severity: 'critical', status: 'open', auto_generated: true,
    metadata: { silent_jobs: unhealthyJobs.map(j => ({ name: j.job_name, status: deriveHealthStatus(j), last_run_at: j.last_run_at, next_run_at: j.next_run_at, cron_expression: j.cron_expression })), runbook_id: runbook?.id || null, runbook_title: runbook?.title || 'INC-CRON-001', detected_at: new Date().toISOString(), sentinel_run_id: requestId }
  }).select('id').single();

  if (taskError) throw taskError;
  logger.info(`[${requestId}] Created P0 task: ${task?.id}`);

  await supabase.from('audit_logs').insert({ action: 'CRON_SILENT_FAILURE_DETECTED', resource_type: 'scheduled_jobs', details: { silent_jobs_count: unhealthyJobs.length, task_id: task?.id, sentinel_run: requestId, jobs: unhealthyJobs.map(j => j.job_name) }, severity: 'critical' });

  const duration = Date.now() - startTime;
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'cron-sentinel', p_success: true, p_duration_ms: duration, p_result: { silent_jobs: unhealthyJobs.length, task_created: task?.id }, p_processed_count: unhealthyJobs.length, p_job_source: 'cron' });
  await supabase.rpc('update_cron_health', { p_cron_name: 'cron-sentinel', p_success: true, p_error: null });
  recordMetric({ function_name: 'cron-sentinel', operation_type: 'edge_function', duration_ms: duration, status_code: 200, metadata: { silent_jobs: unhealthyJobs.length, task_id: task?.id } }).catch(e => logger.warn('[cron-sentinel] APM metric failed:', e));

  return { success: true, message: 'Alert created for silent cron jobs', task_id: task?.id, silent_jobs: unhealthyJobs.length, duration_ms: duration };
});
