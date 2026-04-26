// check-task-sla-breach.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class CheckTaskSlaBreachUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] CheckTaskSlaBreachUseCase: Starting SLA breach check...`);

    try {
      const breachedCount = await this.checkRepository.rpc('check_task_sla_breach');
      const tasksBreached = breachedCount || 0;
      
      let anomalyCheckRan = false;
      try {
        await this.checkRepository.rpc('check_job_health_anomalies_and_alert');
        anomalyCheckRan = true;
      } catch (err) {
        logger.warn(`[${requestId}] CheckTaskSlaBreachUseCase: anomaly check error:`, err);
      }

      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'check-task-sla-breach',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { tasksBreached, anomalyCheckRan },
        p_processed_count: tasksBreached,
        p_job_source: 'cron'
      });

      return { success: true, tasksBreached, anomalyCheckRan, timestamp: new Date().toISOString() };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'check-task-sla-breach',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: msg,
        p_result: { error: msg },
        p_processed_count: 0,
        p_job_source: 'cron'
      });
      throw error;
    }
  }
}
