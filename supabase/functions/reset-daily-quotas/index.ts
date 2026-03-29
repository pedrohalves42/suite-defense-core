/**
 * reset-daily-quotas - Resets daily tenant quotas
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { recordMetric } from '../_shared/apm.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;

  logger.info(`[reset-daily-quotas][${requestId}] Starting daily quota reset`);

  const { error } = await supabase
    .from('tenant_features')
    .update({ quota_used: 0 })
    .eq('feature_key', 'advanced_scans_daily');

  if (error) throw error;

  logger.info(`[reset-daily-quotas][${requestId}] Daily quotas reset successfully`);

  recordMetric({
    function_name: 'reset-daily-quotas',
    operation_type: 'edge_function',
    duration_ms: 0,
    status_code: 200,
  }).catch(() => {});

  return { success: true, message: 'Daily quotas reset successfully' };
});
