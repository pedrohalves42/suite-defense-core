// check-installation-health.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';
import { withTimeout } from '../../_shared/timeout.ts';

export class CheckInstallationHealthUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    let alertsCreated = 0;

    try {
      await withTimeout(async () => {
        logger.info(`[${requestId}] CheckInstallationHealthUseCase: Verificando taxa de falha por tenant...`);
        const tenants = await this.checkRepository.getTenants();
        if (!tenants?.length) return;

        const tenantIds = tenants.map(t => t.id);
        const healthResults = await this.checkRepository.getInstallationHealthBatch(tenantIds);
        
        const pendingAlerts: any[] = [];

        for (const healthData of healthResults) {
          const failureRatePct = healthData.failure_rate_pct || 0;
          const threshold = healthData.threshold || 30;
          
          if (failureRatePct > threshold) {
            pendingAlerts.push({
              severity: 'high',
              alert_type: 'installation_failure',
              title: 'Alta taxa de falha em instalacoes',
              message: `Taxa de falha: ${failureRatePct}% (threshold: ${threshold}%)`,
              details: healthData,
              tenant_id: healthData.tenant_id,
              trace_id: requestId
            });
            alertsCreated++;
          }
        }

        if (pendingAlerts.length > 0) {
          await this.checkRepository.createSystemAlert(pendingAlerts);
          logger.info(`[${requestId}] CheckInstallationHealthUseCase: ${pendingAlerts.length} alerts created in batch`);
        }

      }, { timeoutMs: 60000 });

      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'check-installation-health',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { success: true, alerts_created: alertsCreated },
        p_processed_count: alertsCreated,
        p_job_source: 'cron'
      });

      return { success: true, alerts_created: alertsCreated };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[${requestId}] CheckInstallationHealthUseCase: Fatal error:`, msg);
      throw error;
    }
  }
}
