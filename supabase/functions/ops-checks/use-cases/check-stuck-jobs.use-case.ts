// check-stuck-jobs.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

interface StuckJob {
  id: string; agent_name: string; type: string; delivered_at: string; tenant_id: string; minutes_stuck: number;
}

export class CheckStuckJobsUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] CheckStuckJobsUseCase: Starting stuck jobs check (adaptive thresholds)`);

    const deliveredJobs = await this.checkRepository.getJobs({
      eq: { status: 'delivered' }
    });

    if (!deliveredJobs || deliveredJobs.length === 0) {
      return { success: true, stuck_jobs: 0, alerts_created: 0, auto_failed: 0, timestamp: new Date().toISOString() };
    }

    const stuckJobs: StuckJob[] = [];
    const autoFailIds: string[] = [];

    for (const job of deliveredJobs as any[]) {
      const minutesStuck = Math.floor((Date.now() - new Date(job.delivered_at).getTime()) / (1000 * 60));
      const threshold = this.getZombieThresholdMinutes(job.type);
      if (minutesStuck >= threshold) {
        stuckJobs.push({ ...job, minutes_stuck: minutesStuck });
        if (minutesStuck >= threshold * 2) autoFailIds.push(job.id);
      }
    }

    let autoFailedCount = 0;
    if (autoFailIds.length > 0) {
      const { count } = await (this.checkRepository as any).supabase
        .from('jobs')
        .update({ status: 'failed', error_message: 'Auto-failed by watchdog: stuck for too long' })
        .in('id', autoFailIds);
      autoFailedCount = count || autoFailIds.length;
    }

    let alertsCreated = 0;
    const stuckByTenant = stuckJobs.reduce((acc: any, job) => {
      acc[job.tenant_id] = acc[job.tenant_id] || [];
      acc[job.tenant_id].push(job);
      return acc;
    }, {});

    for (const [tenantId, jobs] of Object.entries(stuckByTenant) as any) {
      const existing = await this.checkRepository.findExistingAlert({
        tenant_id: tenantId,
        alert_type: 'jobs_stuck',
        status: 'active'
      });
      
      if (!existing) {
        await this.checkRepository.createSystemAlert({
          tenant_id: tenantId, alert_type: 'jobs_stuck', severity: 'medium',
          title: `${jobs.length} jobs travados no estado entregue`,
          message: `Jobs detectados sem retorno do agente: ${jobs.map((j: any) => j.type).join(', ')}`,
          details: { jobs: jobs.map((j: any) => ({ id: j.id, type: j.type, minutes: j.minutes_stuck })), auto_failed: autoFailIds.filter(id => jobs.some((j: any) => j.id === id)).length },
          trace_id: requestId
        });
        alertsCreated++;
      }
    }

    const result = { success: true, stuck_jobs: stuckJobs.length, alerts_created: alertsCreated, auto_failed: autoFailedCount, timestamp: new Date().toISOString() };
    await this.checkRepository.logScheduledJobRun({ p_job_key: 'check-stuck-jobs', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: result, p_processed_count: stuckJobs.length, p_job_source: 'cron' });

    return result;
  }

  private getZombieThresholdMinutes(jobType: string): number {
    if (jobType === 'health_check' || jobType === 'config') return 15;
    if (jobType.startsWith('collect_') || jobType === 'light_vuln_scan' || jobType === 'integration_test_v3') return 30;
    if (jobType === 'software_inventory_collect' || jobType === 'disk_cleanup') return 60;
    if (jobType === 'update_agent' || jobType === 'apply_security_patch' || jobType === 'reinstall_agent') return 120;
    return 45;
  }
}
