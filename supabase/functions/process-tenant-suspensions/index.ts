/**
 * process-tenant-suspensions - Processes suspensions and cleanup
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;

  // Phase 1: Process suspensions via RPC
  const { data: suspensionResult, error: suspensionError } = await supabase.rpc(
    'process_tenant_suspensions'
  );

  if (suspensionError) {
    logger.error(`[${requestId}] Suspension processing error:`, suspensionError);
    return new Response(
      JSON.stringify({ error: suspensionError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Phase 2: Cleanup data for suspended tenants
  const { data: suspendedTenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, suspended_at')
    .in('suspension_status', ['suspended', 'pending_deletion'])
    .limit(10);

  if (tenantsError) {
    logger.error(`[${requestId}] Error fetching suspended tenants:`, tenantsError);
  }

  const cleanupResults: { tenant_id: string; status: string; result?: unknown; error?: string }[] = [];
  if (suspendedTenants && suspendedTenants.length > 0) {
    for (const tenant of suspendedTenants) {
      const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
        'cleanup_suspended_tenant_data',
        { p_tenant_id: tenant.id }
      );

      if (cleanupError) {
        logger.error(`[${requestId}] Cleanup error for tenant ${tenant.id}:`, cleanupError);
        cleanupResults.push({ tenant_id: tenant.id, status: 'error', error: cleanupError.message });
      } else {
        cleanupResults.push({ tenant_id: tenant.id, status: 'completed', result: cleanupResult });
      }
    }
  }

  logger.info(`[${requestId}] Tenant suspension processing completed`);

  return {
    suspension: suspensionResult,
    cleanup: { tenants_processed: cleanupResults.length, results: cleanupResults },
    processed_at: new Date().toISOString(),
  };
});
