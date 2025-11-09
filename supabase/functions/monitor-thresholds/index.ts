import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

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

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting threshold monitoring`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    // Get all tenants with their settings
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        tenant_settings (
          alert_threshold_virus_positive,
          alert_threshold_failed_jobs,
          alert_threshold_offline_agents,
          enable_email_alerts,
          enable_webhook_alerts,
          alert_email,
          alert_webhook_url
        )
      `);

    if (tenantsError) {
      console.error(`[${requestId}] Error fetching tenants:`, tenantsError);
      throw tenantsError;
    }

    console.log(`[${requestId}] Monitoring ${tenants?.length || 0} tenants`);

    const alerts: TenantAlert[] = [];

    for (const tenant of tenants || []) {
      if (!tenant.tenant_settings || tenant.tenant_settings.length === 0) {
        continue;
      }

      const settings = tenant.tenant_settings[0];

      // Skip if alerts are disabled
      if (!settings.enable_email_alerts && !settings.enable_webhook_alerts) {
        continue;
      }

      // Count virus detections in last 24 hours
      const { count: virusCount, error: virusError } = await supabase
        .from('virus_scans')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_malicious', true)
        .gte('scanned_at', last24Hours);

      if (virusError) {
        console.error(`[${requestId}] Error counting virus scans for tenant ${tenant.id}:`, virusError);
        continue;
      }

      // Count failed jobs in last 24 hours
      const { count: failedJobsCount, error: failedJobsError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'failed')
        .gte('created_at', last24Hours);

      if (failedJobsError) {
        console.error(`[${requestId}] Error counting failed jobs for tenant ${tenant.id}:`, failedJobsError);
        continue;
      }

      // Count offline agents (no heartbeat in last 5 minutes)
      const { count: offlineAgentsCount, error: offlineAgentsError } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .or(`last_heartbeat.is.null,last_heartbeat.lt.${last5Minutes}`);

      if (offlineAgentsError) {
        console.error(`[${requestId}] Error counting offline agents for tenant ${tenant.id}:`, offlineAgentsError);
        continue;
      }

      const virus = virusCount || 0;
      const failed = failedJobsCount || 0;
      const offline = offlineAgentsCount || 0;

      // Check if any threshold is exceeded
      const virusThresholdExceeded = virus >= settings.alert_threshold_virus_positive;
      const failedJobsThresholdExceeded = failed >= settings.alert_threshold_failed_jobs;
      const offlineAgentsThresholdExceeded = offline >= settings.alert_threshold_offline_agents;

      if (virusThresholdExceeded || failedJobsThresholdExceeded || offlineAgentsThresholdExceeded) {
        alerts.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          virus_count: virus,
          failed_jobs_count: failed,
          offline_agents_count: offline,
          settings
        });

        console.log(`[${requestId}] Alert triggered for tenant ${tenant.name}:`, {
          virus,
          failed,
          offline,
          thresholds: {
            virus: settings.alert_threshold_virus_positive,
            failed: settings.alert_threshold_failed_jobs,
            offline: settings.alert_threshold_offline_agents
          }
        });
      }
    }

    // Send alerts
    const alertResults = [];
    for (const alert of alerts) {
      try {
        // Build alert message
        const issues = [];
        if (alert.virus_count >= alert.settings.alert_threshold_virus_positive) {
          issues.push(`${alert.virus_count} vírus detectados (threshold: ${alert.settings.alert_threshold_virus_positive})`);
        }
        if (alert.failed_jobs_count >= alert.settings.alert_threshold_failed_jobs) {
          issues.push(`${alert.failed_jobs_count} jobs falhados (threshold: ${alert.settings.alert_threshold_failed_jobs})`);
        }
        if (alert.offline_agents_count >= alert.settings.alert_threshold_offline_agents) {
          issues.push(`${alert.offline_agents_count} agentes offline (threshold: ${alert.settings.alert_threshold_offline_agents})`);
        }

        const message = `Alertas de threshold excedidos para ${alert.tenant_name}`;
        const details = {
          timeframe: 'Últimas 24 horas',
          issues,
          virus_count: alert.virus_count,
          failed_jobs_count: alert.failed_jobs_count,
          offline_agents_count: alert.offline_agents_count,
          thresholds: {
            virus: alert.settings.alert_threshold_virus_positive,
            failed_jobs: alert.settings.alert_threshold_failed_jobs,
            offline_agents: alert.settings.alert_threshold_offline_agents
          }
        };

        // Call send-system-alert edge function
        const { data: alertData, error: alertError } = await supabase.functions.invoke('send-system-alert', {
          body: {
            event_type: 'threshold_exceeded',
            severity: 'high',
            message,
            details,
            tenant_id: alert.tenant_id
          }
        });

        if (alertError) {
          console.error(`[${requestId}] Error sending alert for tenant ${alert.tenant_id}:`, alertError);
          alertResults.push({
            tenant_id: alert.tenant_id,
            success: false,
            error: alertError.message
          });
        } else {
          console.log(`[${requestId}] Alert sent successfully for tenant ${alert.tenant_name}`);
          alertResults.push({
            tenant_id: alert.tenant_id,
            success: true,
            data: alertData
          });
        }
      } catch (error) {
        console.error(`[${requestId}] Error processing alert for tenant ${alert.tenant_id}:`, error);
        alertResults.push({
          tenant_id: alert.tenant_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const result = {
      success: true,
      monitored_tenants: tenants?.length || 0,
      alerts_triggered: alerts.length,
      alerts_sent: alertResults.filter(r => r.success).length,
      alert_results: alertResults,
      timestamp: now.toISOString()
    };

    console.log(`[${requestId}] Monitoring completed:`, result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Fatal error:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
