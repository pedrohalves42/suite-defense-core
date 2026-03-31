/**
 * process-failed-jobs - Intelligent failed job processing with DLQ
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const MAX_RETRIES = 3;
const RETRYABLE_CLASSES = ['TRANSIENT'];
const DLQ_CLASSES = ['AGENT_OFFLINE', 'AGENT_STALLED', 'AGENT_INCOMPATIBLE', 'CASCADE_FAILURE', 'BUG', 'POLICY', 'SECURITY'];

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  const results = { processed: 0, retried: 0, sentToDlq: 0, alertsCreated: 0, exhausted: 0, byClass: {} as Record<string, number>, errors: [] as string[] };

  logger.info(`[process-failed-jobs][${requestId}] Starting intelligent failed jobs processing...`);

  const { data: failedJobs, error: fetchError } = await supabase
    .from('jobs')
    .select('id, tenant_id, agent_id, agent_name, type, payload, status, approved, error_message, retry_count, failure_class')
    .eq('status', 'failed')
    .lt('retry_count', MAX_RETRIES)
    .order('completed_at', { ascending: true })
    .limit(50);

  if (fetchError) throw new Error(`Failed to fetch failed jobs: ${fetchError.message}`);

  if (!failedJobs || failedJobs.length === 0) {
    logger.info(`[process-failed-jobs][${requestId}] No failed jobs to process`);
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-failed-jobs', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { message: 'No failed jobs to process' }, p_processed_count: 0, p_job_source: 'cron' });
    return { success: true, ...results };
  }

  logger.info(`[process-failed-jobs][${requestId}] Found ${failedJobs.length} failed jobs to process`);

  for (const job of failedJobs) {
    results.processed++;
    const currentRetry = (job.retry_count || 0) + 1;
    const failureClass = job.failure_class || 'BUG';
    results.byClass[failureClass] = (results.byClass[failureClass] || 0) + 1;

    try {
      const shouldRetry = RETRYABLE_CLASSES.includes(failureClass) && currentRetry < MAX_RETRIES;
      const shouldDlq = DLQ_CLASSES.includes(failureClass) || currentRetry >= MAX_RETRIES;

      if (shouldDlq) {
        logger.info(`[process-failed-jobs][${requestId}] Job ${job.id} -> DLQ (class: ${failureClass}, retries: ${currentRetry})`);
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
        logger.info(`[process-failed-jobs][${requestId}] Job ${job.id} -> RETRY (class: ${failureClass}, attempt: ${currentRetry}/${MAX_RETRIES})`);
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

  logger.info(`[process-failed-jobs][${requestId}] Processing complete:`, results);

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-failed-jobs', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: results, p_processed_count: results.processed, p_job_source: 'cron' });

  return { success: true, ...results };
});
