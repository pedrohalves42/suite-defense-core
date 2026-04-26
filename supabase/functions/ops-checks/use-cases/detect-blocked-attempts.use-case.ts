// detect-blocked-attempts.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class DetectBlockedAttemptsUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] DetectBlockedAttemptsUseCase: Starting detection...`);

    try {
      // In hexagonal, we use the repository for RPC calls
      const data = await this.checkRepository.rpc('detect_blocked_access_attempts');
      const insertedCount = (data as any[])?.[0]?.inserted_count ?? 0;

      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'detect-blocked-attempts',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { inserted_count: insertedCount },
        p_processed_count: insertedCount as number,
        p_job_source: 'cron'
      });

      return { status: 'ok', inserted_count: insertedCount, duration_ms: Date.now() - startedAt, requestId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes('timeout') || msg.includes('57014');
      
      try {
        await this.checkRepository.logScheduledJobRun({
          p_job_key: 'detect-blocked-attempts',
          p_success: false,
          p_duration_ms: Date.now() - startedAt,
          p_error: isTimeout ? 'RPC timeout' : msg,
          p_result: null,
          p_processed_count: 0,
          p_job_source: 'cron'
        });
      } catch (logErr) {
        logger.warn('[DetectBlockedAttemptsUseCase] log_scheduled_job_run failed', logErr);
      }

      return { status: isTimeout ? 'timeout' : 'error', error: isTimeout ? 'Query timed out' : msg, requestId };
    }
  }
}
