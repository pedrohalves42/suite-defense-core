
/**
 * check-tenant-abuse - Detect abusive tenant behavior
 * Migrated to serveInternal middleware (cron/service_role only)
 */
import { serveInternal } from '../_shared/serve-internal.ts';
import { logger } from '../_shared/logger.ts';

const THRESHOLDS = {
  JOBS_PER_HOUR: 500,
  FAILED_AUTH_PER_HOUR: 50,
  AGENTS_OVER_LIMIT_RATIO: 1.2,
};

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  logger.info(`[${requestId}] check-tenant-abuse started`);

  // Call optimized RPC to get all abuse metrics in one go
  const { data: metrics, error: rpcErr } = await supabase.rpc('get_tenant_abuse_metrics', {
    job_threshold: THRESHOLDS.JOBS_PER_HOUR,
    failed_auth_threshold: THRESHOLDS.FAILED_AUTH_PER_HOUR,
    agent_overflow_ratio: THRESHOLDS.AGENTS_OVER_LIMIT_RATIO,
  });

  if (rpcErr) {
    logger.error(`[${requestId}] RPC get_tenant_abuse_metrics failed`, rpcErr);
    return new Response(JSON.stringify({ error: 'Failed to fetch abuse metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const alerts = metrics || [];
  
  // Persist alerts if found
  if (alerts.length > 0) {
    const alertRows = alerts.map(a => ({
      tenant_id: a.tenant_id,
      alert_type: `abuse_${a.abuse_type}`,
      title: `Abuse detected: ${a.abuse_type}`,
      message: `Tenant "${a.tenant_name}" exceeded threshold: ${a.current_value}/${a.threshold}`,
      severity: a.severity || 'warning',
      status: 'active',
    }));

    // Use upsert to avoid duplicate alerts for the same abuse type/tenant if needed, 
    // or just insert if we want a history. Using insert for history.
    const { error: insertErr } = await supabase
      .from('system_alerts')
      .insert(alertRows);

    if (insertErr) {
      logger.error(`[${requestId}] Failed to insert alerts`, insertErr);
    } else {
      logger.info(`[${requestId}] Created ${alerts.length} abuse alerts`);
    }
  }

  logger.info(`[${requestId}] check-tenant-abuse completed. Abuse cases found: ${alerts.length}`);

  return {
    success: true,
    tenants_checked: alerts.length,
    alerts_created: alerts.length,
    alerts,
  };
});