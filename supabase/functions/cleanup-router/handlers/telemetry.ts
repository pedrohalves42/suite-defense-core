/**
 * Handler: Cleanup Telemetry
 * Runs expired telemetry cleanup RPC and summarizes hourly data per tenant.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

export async function handleCleanupTelemetry(supabase: SupabaseClient, requestId: string) {
  const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_expired_telemetry');
  if (cleanupError) {
    logger.error(`[${requestId}] [cleanup:telemetry] Cleanup error:`, cleanupError.message);
  }

  const { data: tenants } = await supabase
    .from('telemetry_retention_config')
    .select('tenant_id')
    .eq('is_enabled', true);

  const uniqueTenants = [...new Set((tenants || []).map((t: { tenant_id: string }) => t.tenant_id))];

  const CONCURRENCY = 5;
  const summaryResults: { tenant_id: string; result: unknown }[] = [];

  for (let i = 0; i < uniqueTenants.length; i += CONCURRENCY) {
    const batch = uniqueTenants.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (tenantId: string) => {
        const { data: summaryResult, error: summaryError } = await supabase.rpc('summarize_telemetry_hourly', {
          p_tenant_id: tenantId,
          p_hours_ago: 2,
        });
        if (summaryError) {
          logger.error(`[${requestId}] [cleanup:telemetry] Summary error for ${tenantId}:`, summaryError.message);
        }
        return { tenant_id: tenantId, result: summaryResult };
      })
    );
    summaryResults.push(...batchResults);
  }

  return {
    success: true,
    cleanup: cleanupResult,
    summaries: summaryResults,
    tenants_processed: uniqueTenants.length,
  };
}
