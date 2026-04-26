import { IJobRepository } from '../repositories/job.repository.ts';
import { logger } from '../../logger.ts';

export interface ProcessFailedJobsResult {
  success: true;
  processed: number;
  retried: number;
  sentToDlq: number;
  alertsCreated: number;
  exhausted: number;
  byClass: Record<string, number>;
  errors: string[];
}

export class ProcessFailedJobsUseCase {
  private readonly MAX_RETRIES = 3;
  private readonly RETRYABLE_CLASSES = ['TRANSIENT'];
  private readonly DLQ_CLASSES = ['AGENT_OFFLINE', 'AGENT_STALLED', 'AGENT_INCOMPATIBLE', 'CASCADE_FAILURE', 'BUG', 'POLICY', 'SECURITY'];

  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly supabase: any // Still need it for system_alerts until we have an AlertRepository
  ) {}

  async execute(requestId: string): Promise<ProcessFailedJobsResult> {
    const startedAt = Date.now();
    const results: ProcessFailedJobsResult = {
      success: true,
      processed: 0,
      retried: 0,
      sentToDlq: 0,
      alertsCreated: 0,
      exhausted: 0,
      byClass: {},
      errors: []
    };

    try {
      const failedJobs = await this.jobRepo.findFailedJobs(50);

      if (failedJobs.length === 0) {
        return results;
      }

      for (const job of failedJobs) {
        results.processed++;
        const currentRetry = (job.retry_count || 0) + 1;
        const failureClass = job.failure_class || 'BUG';
        results.byClass[failureClass] = (results.byClass[failureClass] || 0) + 1;

        try {
          const shouldRetry = this.RETRYABLE_CLASSES.includes(failureClass) && currentRetry < this.MAX_RETRIES;
          const shouldDlq = this.DLQ_CLASSES.includes(failureClass) || currentRetry >= this.MAX_RETRIES;

          if (shouldDlq) {
            await this.handleDlqMigration(job, currentRetry, failureClass, results);
          } else if (shouldRetry) {
            await this.handleJobRetry(job, currentRetry, results);
          }
        } catch (err) {
          const msg = `Job ${job.id}: ${err instanceof Error ? err.message : 'Unknown error'}`;
          results.errors.push(msg);
          logger.error(`[${requestId}] ${msg}`);
        }
      }

      return results;
    } catch (error) {
      logger.error(`[${requestId}] ProcessFailedJobsUseCase failed`, error);
      throw error;
    }
  }

  private async handleDlqMigration(job: any, currentRetry: number, failureClass: string, results: ProcessFailedJobsResult) {
    results.sentToDlq++;
    if (currentRetry >= this.MAX_RETRIES) results.exhausted++;

    if (failureClass !== 'EXPECTED_DROP') {
      const { error: alertError } = await this.supabase.from('system_alerts').insert({
        tenant_id: job.tenant_id,
        agent_id: job.agent_id,
        alert_type: 'job_failure_dlq',
        severity: failureClass === 'SECURITY' ? 'critical' : 'high',
        message: `Job "${job.type}" enviado para DLQ: ${failureClass}`,
        metadata: { job_id: job.id, job_type: job.type, agent_name: job.agent_name, failure_class: failureClass, last_error: job.error_message, retry_count: currentRetry },
        resolved: false,
      });
      if (!alertError) results.alertsCreated++;
    }

    await this.jobRepo.upsertDlq({
      original_job_id: job.id,
      tenant_id: job.tenant_id,
      agent_id: job.agent_id,
      agent_name: job.agent_name,
      job_type: job.type,
      payload: job.payload,
      error_count: currentRetry,
      retry_count: currentRetry,
      max_retries: this.MAX_RETRIES,
      status: 'dlq',
      last_error: job.error_message,
      failure_class: failureClass,
      failed_at: new Date().toISOString(),
    });

    await this.jobRepo.updateJob(job.id, {
      retry_count: this.MAX_RETRIES,
      error_message: `[DLQ:${failureClass}] ${job.error_message || 'Sent to DLQ'}`
    });
  }

  private async handleJobRetry(job: any, currentRetry: number, results: ProcessFailedJobsResult) {
    await this.jobRepo.createJob({
      tenant_id: job.tenant_id,
      agent_id: job.agent_id,
      agent_name: job.agent_name,
      type: job.type,
      payload: job.payload,
      status: 'queued',
      approved: job.approved,
      retry_count: currentRetry,
      parent_job_id: job.id,
    });

    await this.jobRepo.updateJob(job.id, {
      retry_count: currentRetry,
      error_message: `[RETRY ${currentRetry}/${this.MAX_RETRIES}] ${job.error_message || 'Unknown error'}`
    });

    results.retried++;
  }
}
