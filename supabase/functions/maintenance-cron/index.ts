/**
 * maintenance-cron - Consolidated maintenance function (COST-OPT v9)
 * MODULARIZED: Phase handlers in phase-handlers.ts
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { recordMetric } from '../_shared/apm.ts';
import { logger } from '../_shared/logger.ts';
import { createEmptyResult, runMaintenanceRpc, cleanupStuckJobs, autoCleanupJobs, runRemainingPhases, cleanupLegacyScripts, computeTotalOps } from './phase-handlers.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();
  const now = new Date().toISOString();
  const result = createEmptyResult();

  try {
    await runMaintenanceRpc(supabase, result);
    await cleanupStuckJobs(supabase, now, result);
    await autoCleanupJobs(supabase, now, result);
    await runRemainingPhases(supabase, now, result);

    result.duration_ms = Date.now() - startTime;
    result.total_operations = computeTotalOps(result);

    logger.info(`[maintenance-cron][${requestId}] Completed in ${result.duration_ms}ms: ${result.total_operations} operations`);

    recordMetric({ function_name: 'maintenance-cron', operation_type: 'edge_function', duration_ms: result.duration_ms, status_code: 200, metadata: result as unknown as Record<string, any> }).catch(() => {});
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'maintenance-cron-consolidated', p_success: true, p_duration_ms: result.duration_ms, p_result: result, p_processed_count: result.total_operations, p_job_source: 'cron' }); } catch (err) { logger.warn('[maintenance-cron] log_scheduled_job_run failed', err); }
    try { await supabase.rpc('update_cron_health', { p_cron_name: 'maintenance-cron', p_success: true, p_details: result }); } catch (err) { logger.warn('[maintenance-cron] update_cron_health failed', err); }

    return { success: true, ...result };
  } catch (error) {
    const err = error as Error;
    logger.error(`[maintenance-cron][${requestId}] Fatal error:`, err.message);
    result.duration_ms = Date.now() - startTime;
    try { await supabase.rpc('mark_cron_failure', { p_cron_name: 'maintenance-cron', p_error: err.message }); } catch (e) { logger.warn('[maintenance-cron] mark_cron_failure failed', e); }
    throw error;
  }
});
