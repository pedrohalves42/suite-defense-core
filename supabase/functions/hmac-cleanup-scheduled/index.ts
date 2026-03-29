/**
 * HMAC Cleanup Scheduled Function
 * Migrated to serveInternal middleware
 * Runs every 2 hours to clean up old HMAC signatures
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();

  logger.info(`[${requestId}] HMAC cleanup started`);

  // Delete signatures older than 6 hours (well beyond the 5-minute replay window)
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const { data: deleted, error } = await supabase
    .from('hmac_signatures')
    .delete()
    .lt('used_at', cutoff.toISOString())
    .select('id');

  if (error) {
    logger.error(`[${requestId}] Error deleting signatures`, error);
    throw error;
  }

  const deletedCount = deleted?.length || 0;
  const duration = Date.now() - startTime;

  logger.info(`[${requestId}] Deleted ${deletedCount} HMAC signatures in ${duration}ms`);

  // Log cleanup action for audit
  await supabase.from('audit_logs').insert({
    action: 'hmac_cleanup_scheduled',
    resource_type: 'system',
    resource_id: 'hmac_signatures',
    success: true,
    details: {
      deleted_count: deletedCount,
      cutoff: cutoff.toISOString(),
      duration_ms: duration,
      request_id: requestId
    }
  });

  // Log observability to scheduled_job_runs
  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'hmac-cleanup-scheduled',
    p_success: true,
    p_duration_ms: duration,
    p_result: { deleted_count: deletedCount, cutoff: cutoff.toISOString() },
    p_processed_count: deletedCount,
    p_job_source: 'cron'
  });

  return {
    success: true,
    deleted: deletedCount,
    duration_ms: duration,
    cutoff: cutoff.toISOString(),
    next_run: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    request_id: requestId
  };
});
