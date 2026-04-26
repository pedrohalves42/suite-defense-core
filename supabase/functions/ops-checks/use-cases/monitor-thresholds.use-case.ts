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

    const alerts: any[] = [];

    for (const tenant of tenants) {
      const settingsArr = (tenant as any).tenant_settings;
      if (!settingsArr || settingsArr.length === 0) continue;
      const settings = settingsArr[0];
      if (!settings.enable_email_alerts && !settings.enable_webhook_alerts) continue;

      const virusCount = await this.checkRepository.getCount('virus_scans', {
        eq: { tenant_id: tenant.id, is_malicious: true },
        gte: { scanned_at: last24Hours }
      });

      const failedJobsCount = await this.checkRepository.getCount('jobs', {
        eq: { tenant_id: tenant.id, status: 'failed' },
        gte: { created_at: last24Hours }
      });

      const offlineAgentsCount = await this.checkRepository.getCount('agents', {
        eq: { tenant_id: tenant.id },
        notNull: 'last_heartbeat',
        lt: { last_heartbeat: last5Minutes }
      });

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
      logger.error(`[${requestId}] MonitorThresholdsUseCase: Could not import handleNotifyEmail: ${e.message}`);
    }

    for (const alert of alerts) {
      try {
        const issues: string[] = [];
        const s = alert.settings;
        if (alert.virus >= s.alert_threshold_virus_positive) issues.push(`${alert.virus} virus detectados`);
        if (alert.failed >= s.alert_threshold_failed_jobs) issues.push(`${alert.failed} jobs falhados`);
        if (alert.offline >= s.alert_threshold_offline_agents) issues.push(`${alert.offline} agentes offline`);

        if (handleNotifyEmail) {
          await handleNotifyEmail((this.checkRepository as any).supabase, requestId, {
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
