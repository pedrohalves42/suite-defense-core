// monitor-thresholds.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class MonitorThresholdsUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, _payload: Record<string, unknown>) {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const tenants = await this.checkRepository.getTenantsWithSettings();
    logger.info(`[${requestId}] MonitorThresholdsUseCase: Monitoring ${tenants.length} tenants`);

    const activeTenants = tenants.filter(t => {
      const settingsArr = (t as any).tenant_settings;
      if (!settingsArr || settingsArr.length === 0) return false;
      const s = settingsArr[0];
      return s.enable_email_alerts || s.enable_webhook_alerts;
    });

    if (activeTenants.length === 0) {
      return { success: true, monitored_tenants: tenants.length, alerts_triggered: 0, alerts_sent: 0, timestamp: now.toISOString() };
    }

    const tenantIds = activeTenants.map(t => t.id);

    // Batch get counts for all active tenants in 3 parallel calls
    const [virusCounts, failedJobsCounts, offlineAgentsCounts] = await Promise.all([
      this.checkRepository.getBatchCounts('virus_scans', tenantIds, {
        eq: { is_malicious: true },
        gte: { scanned_at: last24Hours }
      }),
      this.checkRepository.getBatchCounts('jobs', tenantIds, {
        eq: { status: 'failed' },
        gte: { created_at: last24Hours }
      }),
      this.checkRepository.getBatchCounts('agents', tenantIds, {
        notNull: 'last_heartbeat',
        lt: { last_heartbeat: last5Minutes }
      })
    ]);

    const alerts: any[] = [];

    for (const tenant of activeTenants) {
      const settings = (tenant as any).tenant_settings[0];
      const virusCount = virusCounts[tenant.id] || 0;
      const failedJobsCount = failedJobsCounts[tenant.id] || 0;
      const offlineAgentsCount = offlineAgentsCounts[tenant.id] || 0;

      if (
        virusCount >= settings.alert_threshold_virus_positive ||
        failedJobsCount >= settings.alert_threshold_failed_jobs ||
        offlineAgentsCount >= settings.alert_threshold_offline_agents
      ) {
        alerts.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          virus: virusCount,
          failed: failedJobsCount,
          offline: offlineAgentsCount,
          settings
        });
      }
    }

    const alertResults = [];
    
    let handleNotifyEmail: any;
    try {
      const notifyModule = await import('../../ops-gateway/handlers/notify.ts');
      handleNotifyEmail = notifyModule.handleNotifyEmail;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[${requestId}] MonitorThresholdsUseCase: Could not import handleNotifyEmail: ${msg}`);
    }

    for (const alert of alerts) {
      try {
        const issues: string[] = [];
        const s = alert.settings;
        if (alert.virus >= s.alert_threshold_virus_positive) issues.push(`${alert.virus} virus detectados`);
        if (alert.failed >= s.alert_threshold_failed_jobs) issues.push(`${alert.failed} jobs falhados`);
        if (alert.offline >= s.alert_threshold_offline_agents) issues.push(`${alert.offline} agentes offline`);

        if (handleNotifyEmail) {
          await handleNotifyEmail(this.checkRepository.supabase, requestId, {
            channel: 'email',
            type: 'system',
            severity: 'high',
            message: `Alertas de threshold excedidos para ${alert.tenant_name}`,
            metadata: { timeframe: 'Ultimas 24 horas', issues },
            tenant_id: alert.tenant_id,
          });
        }
        
        alertResults.push({ tenant_id: alert.tenant_id, success: true });
      } catch (error) {
        alertResults.push({
          tenant_id: alert.tenant_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown'
        });
      }
    }

    return {
      success: true,
      monitored_tenants: tenants.length,
      alerts_triggered: alerts.length,
      alerts_sent: alertResults.filter(r => r.success).length,
      timestamp: now.toISOString(),
    };
  }
}
