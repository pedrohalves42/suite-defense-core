/**
 * evaluate-job-slo - Cron function
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  logger.info(`[${requestId}] evaluate-job-slo: Starting SLO evaluation...`);

  const { data, error } = await supabase.rpc('evaluate_job_slo');

  if (error) {
    logger.error(`[${requestId}] evaluate-job-slo: Error:`, error);
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'evaluate-job-slo',
      p_success: false,
      p_duration_ms: Date.now() - startedAt,
      p_error: error.message,
      p_result: { error: error.message },
      p_processed_count: 0,
      p_job_source: 'cron'
    });
    throw error;
  }

  const results = data || [];
  const tasksCreated = results.filter((r: Record<string, unknown>) => r.out_task_created).length;
  const highBurnRates = results.filter((r: Record<string, unknown>) => (r.out_burn_rate as number) >= 2);

  logger.info(`[${requestId}] evaluate-job-slo: Complete`, {
    tenantsEvaluated: results.length, tasksCreated, highBurnRates: highBurnRates.length
  });

  for (const result of highBurnRates) {
    logger.warn(`[${requestId}] HIGH BURN RATE:`, {
      tenantId: result.out_tenant_id, burnRate: result.out_burn_rate,
      errorRate: result.out_error_rate, severity: result.out_severity,
    });
  }

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'evaluate-job-slo',
    p_success: true,
    p_duration_ms: Date.now() - startedAt,
    p_result: { tenantsEvaluated: results.length, tasksCreated, highBurnRates: highBurnRates.length },
    p_processed_count: results.length,
    p_job_source: 'cron'
  });

  return {
    success: true,
    evaluated: results.length,
    tasksCreated,
    highBurnRates: highBurnRates.length,
    results: results.map((r: Record<string, unknown>) => ({
      tenantId: r.out_tenant_id,
      window: r.out_time_window,
      burnRate: Number(r.out_burn_rate).toFixed(2),
      errorRate: (Number(r.out_error_rate) * 100).toFixed(2) + '%',
      severity: r.out_severity,
      taskCreated: r.out_task_created
    })),
    timestamp: new Date().toISOString()
  };
});
