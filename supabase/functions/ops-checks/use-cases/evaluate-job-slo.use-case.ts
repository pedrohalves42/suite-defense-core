// evaluate-job-slo.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class EvaluateJobSloUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] EvaluateJobSloUseCase: Starting SLO evaluation...`);

    try {
      const data = await this.checkRepository.rpc('evaluate_job_slo');
      const results = data || [];
      const tasksCreated = results.filter((r: any) => r.out_task_created).length;
      const highBurnRates = results.filter((r: any) => (r.out_burn_rate as number) >= 2);

      for (const result of highBurnRates) {
        logger.warn(`[${requestId}] EvaluateJobSloUseCase: HIGH BURN RATE:`, { tenantId: result.out_tenant_id, burnRate: result.out_burn_rate, errorRate: result.out_error_rate, severity: result.out_severity });
      }

      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'evaluate-job-slo',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { tenantsEvaluated: results.length, tasksCreated, highBurnRates: highBurnRates.length },
        p_processed_count: results.length,
        p_job_source: 'cron'
      });

      return {
        success: true, evaluated: results.length, tasksCreated, highBurnRates: highBurnRates.length,
        results: results.map((r: any) => ({ tenantId: r.out_tenant_id, window: r.out_time_window, burnRate: Number(r.out_burn_rate).toFixed(2), errorRate: (Number(r.out_error_rate) * 100).toFixed(2) + '%', severity: r.out_severity, taskCreated: r.out_task_created })),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'evaluate-job-slo',
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
