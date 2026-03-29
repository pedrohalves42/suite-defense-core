/**
 * CHECK-TASK-SLA-BREACH - Scheduled Edge Function
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  logger.info(`[${requestId}] check-task-sla-breach: Starting SLA breach check...`);

  const { data: breachedCount, error: checkError } = await supabase
    .rpc('check_task_sla_breach');

  if (checkError) {
    logger.error(`[${requestId}] check-task-sla-breach: Error:`, checkError);
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-task-sla-breach',
      p_success: false,
      p_duration_ms: Date.now() - startedAt,
      p_error: checkError.message,
      p_result: { error: checkError.message },
      p_processed_count: 0,
      p_job_source: 'cron'
    });
    throw checkError;
  }

  const tasksBreached = breachedCount || 0;

  // Also run anomaly alerts check
  const { error: anomalyError } = await supabase
    .rpc('check_job_health_anomalies_and_alert');

  if (anomalyError) {
    logger.warn(`[${requestId}] check-task-sla-breach: anomaly check error:`, anomalyError);
  }

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-task-sla-breach',
    p_success: true,
    p_duration_ms: Date.now() - startedAt,
    p_result: { tasksBreached, anomalyCheckRan: !anomalyError },
    p_processed_count: tasksBreached,
    p_job_source: 'cron'
  });

  return {
    success: true,
    tasksBreached,
    anomalyCheckRan: !anomalyError,
    timestamp: new Date().toISOString()
  };
});
