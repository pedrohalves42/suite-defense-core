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

        for (const tenant of tenants) {
          try {
            const failureRate = await this.checkRepository.rpc('get_installation_health_status', { p_tenant_id: tenant.id });
            if (!failureRate?.length) continue;
            
            const healthData = failureRate[0];
            const failureRatePct = healthData.failure_rate_pct || 0;
            const threshold = healthData.threshold || 30;
            
            if (failureRatePct > threshold) {
              await this.checkRepository.createSystemAlert({
                severity: 'high',
                alert_type: 'installation_failure',
                title: 'Alta taxa de falha em instalacoes',
                message: `Taxa de falha: ${failureRatePct}% (threshold: ${threshold}%)`,
                details: healthData,
                tenant_id: tenant.id,
                trace_id: requestId
              });
              alertsCreated++;
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[${requestId}] CheckInstallationHealthUseCase: Error for tenant ${tenant.id}:`, errorMsg);
            // Non-fatal for the loop, but we log the specific error message
          }
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
