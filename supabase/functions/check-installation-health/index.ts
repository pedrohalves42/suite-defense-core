/**
 * check-installation-health - Checks installation failure rates per tenant
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { withTimeout } from '../_shared/timeout.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();
  let alertsCreated = 0;

  await withTimeout(async () => {
    logger.info(`[${requestId}] check-installation-health: Verificando taxa de falha por tenant...`);

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantsError) {
      logger.error(`[${requestId}] Erro ao buscar tenants:`, tenantsError);
      return;
    }

    if (!tenants || tenants.length === 0) {
      logger.info(`[${requestId}] Nenhum tenant encontrado`);
      return;
    }

    logger.info(`[${requestId}] Verificando ${tenants.length} tenants`);

    for (const tenant of tenants) {
      const { data: failureRate, error } = await supabase
        .rpc('get_installation_health_status', { p_tenant_id: tenant.id });

      if (error) {
        logger.error(`[${requestId}] Erro para tenant ${tenant.id}:`, error);
        continue;
      }

      if (!failureRate || failureRate.length === 0) continue;

      const healthData = failureRate[0];
      const failureRatePct = healthData.failure_rate_pct || 0;
      const threshold = healthData.threshold || 30;

      if (failureRatePct > threshold) {
        const { error: alertError } = await supabase
          .from('system_alerts')
          .insert({
            severity: 'high', alert_type: 'installation_failure',
            title: 'Alta taxa de falha em instalacoes',
            message: `Taxa de falha de instalacao: ${failureRatePct}% (threshold: ${threshold}%)`,
            details: healthData, tenant_id: tenant.id,
          });

        if (!alertError) alertsCreated++;
      }
    }
  }, { timeoutMs: 60000 });

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-installation-health',
    p_success: true,
    p_duration_ms: Date.now() - startedAt,
    p_result: { success: true, alerts_created: alertsCreated },
    p_processed_count: alertsCreated,
    p_job_source: 'cron',
  });

  return { success: true, alerts_created: alertsCreated };
});
