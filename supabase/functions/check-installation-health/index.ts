/**
 * Check Installation Health - Migrated to assertInternalCaller
 * Cron job that checks installation failure rates per tenant.
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { withTimeout } from '../_shared/timeout.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const startedAt = Date.now();
  let alertsCreated = 0;

  try {
    await withTimeout(async () => {
      logger.info('[check-installation-health] Verificando taxa de falha por tenant...');

      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name');

      if (tenantsError) {
        logger.error('[check-installation-health] Erro ao buscar tenants:', tenantsError);
        return;
      }

      if (!tenants || tenants.length === 0) {
        logger.info('[check-installation-health] Nenhum tenant encontrado');
        return;
      }

      logger.info(`[check-installation-health] Verificando ${tenants.length} tenants`);

      for (const tenant of tenants) {
        const { data: failureRate, error } = await supabase
          .rpc('get_installation_health_status', { p_tenant_id: tenant.id });

        if (error) {
          logger.error(`[check-installation-health] Erro ao buscar health status para tenant ${tenant.id}:`, error);
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

    return new Response(
      JSON.stringify({ success: true, alerts_created: alertsCreated }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[check-installation-health] Erro:', errorMessage);

    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-installation-health',
        p_success: false, p_duration_ms: Date.now() - startedAt,
        p_error: errorMessage, p_result: null, p_processed_count: 0, p_job_source: 'cron',
      });
    } catch (e) { logger.warn('[check-installation-health] Failed to log job run:', e); }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
