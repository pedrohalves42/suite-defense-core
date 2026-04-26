// cron-sentinel.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class CronSentinelUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startTime = Date.now();
    logger.info(`[${requestId}] CronSentinelUseCase: started`);

    const silentJobs = await this.checkRepository.getSilentFailures();
    
    const unhealthyJobs = silentJobs.filter((job: any) => job.enabled !== false).filter((job: any) => this.deriveHealthStatus(job) !== 'OK');
    logger.info(`[${requestId}] CronSentinelUseCase: Checked ${silentJobs.length} jobs, found ${unhealthyJobs.length} unhealthy`);

    if (unhealthyJobs.length === 0) {
      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'cron-sentinel', p_success: true, p_duration_ms: Date.now() - startTime,
        p_result: { message: 'All jobs healthy', jobs_checked: silentJobs.length },
        p_processed_count: 0, p_job_source: 'cron'
      });
      await this.checkRepository.updateCronHealth('cron-sentinel', true, { message: 'All jobs healthy', jobs_checked: silentJobs.length });
      return { success: true, message: 'All cron jobs healthy', jobs_checked: silentJobs.length, silent_jobs: 0 };
    }

    // Check for existing task
    const existingTask = await this.checkRepository.findExistingAlert({
      source_type: 'system_alert',
      title: '⚠ Cron Jobs Silent Failure%',
      status: 'open', // and in_progress? we can check in repo
      created_at_gte: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    });
    
    if (existingTask) return { success: true, message: 'Alert task already exists', existing_task_id: existingTask.id, silent_jobs: unhealthyJobs.length };

    // Get runbook
    const { data: runbook } = await (this.checkRepository as any).supabase.from('runbooks').select('id, title, steps').eq('anomaly_type', 'cron_silent_failure').maybeSingle();
    
    const jobNames = unhealthyJobs.map((j: any) => j.job_key || j.job_name).slice(0, 10).join(', ');
    const moreCount = unhealthyJobs.length > 10 ? ` (+${unhealthyJobs.length - 10} more)` : '';

    const task = await this.checkRepository.createTask({
      tenant_id: (unhealthyJobs[0] as any)?.tenant_id || null, source_type: 'system_alert',
      title: `⚠ Cron Jobs Silent Failure - ${unhealthyJobs.length} jobs`,
      description: `Jobs sem execucao detectados: ${jobNames}${moreCount}. Consulte o Runbook INC-CRON-001.`,
      severity: 'critical', status: 'open', auto_generated: true,
      metadata: { silent_jobs: unhealthyJobs.map((j: any) => ({ name: j.job_key || j.job_name, status: this.deriveHealthStatus(j), last_run_at: j.last_executed_at || j.last_run_at, next_run_at: j.next_run_at, cron_expression: j.cron_expression })), runbook_id: runbook?.id || null, runbook_title: runbook?.title || 'INC-CRON-001', detected_at: new Date().toISOString(), sentinel_run_id: requestId }
    });

    logger.info(`[${requestId}] CronSentinelUseCase: Created P0 task: ${task?.id}`);

    await this.checkRepository.logAudit({
      action: 'CRON_SILENT_FAILURE_DETECTED', resource_type: 'scheduled_jobs',
      details: { silent_jobs_count: unhealthyJobs.length, task_id: task?.id, sentinel_run: requestId, jobs: unhealthyJobs.map((j: any) => j.job_name) },
      severity: 'critical'
    });

    const duration = Date.now() - startTime;
    await this.checkRepository.logScheduledJobRun({ p_job_key: 'cron-sentinel', p_success: true, p_duration_ms: duration, p_result: { silent_jobs: unhealthyJobs.length, task_created: task?.id }, p_processed_count: unhealthyJobs.length, p_job_source: 'cron' });
    await this.checkRepository.updateCronHealth('cron-sentinel', true, { silent_jobs: unhealthyJobs.length, task_created: task?.id });

    return { success: true, message: 'Alert created for silent cron jobs', task_id: task?.id, silent_jobs: unhealthyJobs.length, duration_ms: duration };
  }

  private deriveHealthStatus(job: any): 'OK' | 'NEVER_RAN' | 'STALE' {
    const lastRunAt = job.last_executed_at || job.last_run_at;
    if (!lastRunAt) return 'NEVER_RAN';
    if (job.next_run_at) { const nextRun = new Date(job.next_run_at).getTime(); if (nextRun < Date.now() - 10 * 60 * 1000) return 'STALE'; }
    if (job.silence_duration && job.expected_interval) {
      if (job.silence_duration > job.expected_interval * 1.5) return 'STALE';
    }
    return 'OK';
  }
}
