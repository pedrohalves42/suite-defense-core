/**
 * Monitor Thresholds - Migrated to serveInternal middleware
 * Monitors alert thresholds per tenant and dispatches notifications.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select(`id, name, tenant_settings!tenant_settings_tenant_id_fkey (
      alert_threshold_virus_positive, alert_threshold_failed_jobs,
      alert_threshold_offline_agents, enable_email_alerts,
      enable_webhook_alerts, alert_email, alert_webhook_url
    )`);

  if (tenantsError) throw tenantsError;

  logger.info(`[${requestId}] monitor-thresholds: Monitoring ${tenants?.length || 0} tenants`);

  const alerts: Array<{ tenant_id: string; tenant_name: string; virus: number; failed: number; offline: number; settings: Record<string, unknown> }> = [];

  for (const tenant of tenants || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join returns array
    const settingsArr = (tenant as Record<string, any>).tenant_settings;
    if (!settingsArr || settingsArr.length === 0) continue;
    const settings = settingsArr[0];
    if (!settings.enable_email_alerts && !settings.enable_webhook_alerts) continue;

    const { count: virusCount } = await supabase
      .from('virus_scans').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).eq('is_malicious', true).gte('scanned_at', last24Hours);

    const { count: failedJobsCount } = await supabase
      .from('jobs').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).eq('status', 'failed').gte('created_at', last24Hours);

    const { count: offlineAgentsCount } = await supabase
      .from('agents').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).not('last_heartbeat', 'is', null).lt('last_heartbeat', last5Minutes);

    const virus = virusCount || 0;
    const failed = failedJobsCount || 0;
    const offline = offlineAgentsCount || 0;

    if (virus >= settings.alert_threshold_virus_positive || failed >= settings.alert_threshold_failed_jobs || offline >= settings.alert_threshold_offline_agents) {
      alerts.push({ tenant_id: tenant.id, tenant_name: tenant.name, virus, failed, offline, settings });
    }
  }

  const alertResults = [];
  for (const alert of alerts) {
    try {
      const issues: string[] = [];
      const s = alert.settings as Record<string, number>;
      if (alert.virus >= s.alert_threshold_virus_positive) issues.push(`${alert.virus} virus detectados`);
      if (alert.failed >= s.alert_threshold_failed_jobs) issues.push(`${alert.failed} jobs falhados`);
      if (alert.offline >= s.alert_threshold_offline_agents) issues.push(`${alert.offline} agentes offline`);

      const { error: alertError } = await supabase.functions.invoke('notification-dispatcher', {
        headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
        body: { channel: 'email', type: 'system', severity: 'high',
          message: `Alertas de threshold excedidos para ${alert.tenant_name}`,
          metadata: { timeframe: 'Ultimas 24 horas', issues }, tenant_id: alert.tenant_id },
      });
      alertResults.push({ tenant_id: alert.tenant_id, success: !alertError });
    } catch (error) {
      alertResults.push({ tenant_id: alert.tenant_id, success: false, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return {
    success: true,
    monitored_tenants: tenants?.length || 0,
    alerts_triggered: alerts.length,
    alerts_sent: alertResults.filter(r => r.success).length,
    timestamp: now.toISOString(),
  };
});
