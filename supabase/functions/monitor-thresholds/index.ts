/**
 * Monitor Thresholds - Migrated to assertInternalCaller
 * Monitors alert thresholds per tenant and dispatches notifications.
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

interface TenantAlert {
  tenant_id: string;
  tenant_name: string;
  virus_count: number;
  failed_jobs_count: number;
  offline_agents_count: number;
  settings: {
    alert_threshold_virus_positive: number;
    alert_threshold_failed_jobs: number;
    alert_threshold_offline_agents: number;
    enable_email_alerts: boolean;
    enable_webhook_alerts: boolean;
    alert_email: string | null;
    alert_webhook_url: string | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] Starting threshold monitoring`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id, name,
        tenant_settings!tenant_settings_tenant_id_fkey (
          alert_threshold_virus_positive, alert_threshold_failed_jobs,
          alert_threshold_offline_agents, enable_email_alerts,
          enable_webhook_alerts, alert_email, alert_webhook_url
        )
      `);

    if (tenantsError) {
      logger.error(`[${requestId}] Error fetching tenants:`, tenantsError);
      throw tenantsError;
    }

    logger.info(`[${requestId}] Monitoring ${tenants?.length || 0} tenants`);

    const alerts: TenantAlert[] = [];

    for (const tenant of tenants || []) {
      if (!tenant.tenant_settings || tenant.tenant_settings.length === 0) continue;
      const settings = tenant.tenant_settings[0];
      if (!settings || typeof settings !== 'object') continue;
      if (!settings.enable_email_alerts && !settings.enable_webhook_alerts) continue;

      const { count: virusCount } = await supabase
        .from('virus_scans')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_malicious', true)
        .gte('scanned_at', last24Hours);

      const { count: failedJobsCount } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'failed')
        .gte('created_at', last24Hours);

      const { count: offlineAgentsCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .not('last_heartbeat', 'is', null)
        .lt('last_heartbeat', last5Minutes);

      const virus = virusCount || 0;
      const failed = failedJobsCount || 0;
      const offline = offlineAgentsCount || 0;

      const virusExceeded = virus >= settings.alert_threshold_virus_positive;
      const failedExceeded = failed >= settings.alert_threshold_failed_jobs;
      const offlineExceeded = offline >= settings.alert_threshold_offline_agents;

      if (virusExceeded || failedExceeded || offlineExceeded) {
        alerts.push({
          tenant_id: tenant.id, tenant_name: tenant.name,
          virus_count: virus, failed_jobs_count: failed, offline_agents_count: offline,
          settings,
        });
      }
    }

    const alertResults = [];
    for (const alert of alerts) {
      try {
        const issues = [];
        if (alert.virus_count >= alert.settings.alert_threshold_virus_positive) {
          issues.push(`${alert.virus_count} virus detectados (threshold: ${alert.settings.alert_threshold_virus_positive})`);
        }
        if (alert.failed_jobs_count >= alert.settings.alert_threshold_failed_jobs) {
          issues.push(`${alert.failed_jobs_count} jobs falhados (threshold: ${alert.settings.alert_threshold_failed_jobs})`);
        }
        if (alert.offline_agents_count >= alert.settings.alert_threshold_offline_agents) {
          issues.push(`${alert.offline_agents_count} agentes offline (threshold: ${alert.settings.alert_threshold_offline_agents})`);
        }

        const { error: alertError } = await supabase.functions.invoke('notification-dispatcher', {
          headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
          body: {
            channel: 'email', type: 'system', severity: 'high',
            message: `Alertas de threshold excedidos para ${alert.tenant_name}`,
            metadata: { timeframe: 'Ultimas 24 horas', issues },
            tenant_id: alert.tenant_id,
          },
        });

        alertResults.push({ tenant_id: alert.tenant_id, success: !alertError, error: alertError?.message });
      } catch (error) {
        alertResults.push({ tenant_id: alert.tenant_id, success: false, error: error instanceof Error ? error.message : 'Unknown' });
      }
    }

    const result = {
      success: true,
      monitored_tenants: tenants?.length || 0,
      alerts_triggered: alerts.length,
      alerts_sent: alertResults.filter(r => r.success).length,
      timestamp: now.toISOString(),
    };

    logger.info(`[${requestId}] Monitoring completed:`, result);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error(`[${requestId}] Fatal error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
