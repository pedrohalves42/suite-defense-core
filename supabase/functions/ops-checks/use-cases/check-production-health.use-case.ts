// check-production-health.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class CheckProductionHealthUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    const alerts: any[] = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Heartbeat check
    const recentHeartbeatsCount = await this.checkRepository.getCount('agents', {
      gte: { last_heartbeat: oneHourAgo.toISOString() },
      neq: { status: 'inactive' }
    });
    
    if (recentHeartbeatsCount === 0) {
      const activeAgentsCount = await this.checkRepository.getCount('agents', {
        in: { status: ['active', 'pending'] }
      });
      if (activeAgentsCount > 0) {
        alerts.push({
          tenant_id: null, alert_type: 'no_heartbeats', severity: 'high',
          title: 'Nenhum heartbeat na ultima hora',
          message: `${activeAgentsCount} agente(s) ativo(s) sem heartbeat.`,
          details: { active_agents_count: activeAgentsCount },
          trace_id: requestId
        });
      }
    }

    // Installation failure check
    const installations = await this.checkRepository.getInstallationAnalytics({
      gte: { created_at: oneDayAgo.toISOString() },
      in: { event_type: ['post_installation', 'post_installation_unverified'] }
    });

    if (installations && installations.length >= 10) {
      const failureCount = installations.filter((i: any) => i.success === false).length;
      const failureRate = failureCount / installations.length;
      if (failureRate > 0.30) {
        alerts.push({
          tenant_id: null, alert_type: 'high_installation_failure', severity: 'critical',
          title: `Alta taxa de falha: ${(failureRate * 100).toFixed(1)}%`,
          message: `${failureCount} de ${installations.length} instalacoes falharam.`,
          details: { failure_rate: failureRate, failed_count: failureCount, total_count: installations.length },
          trace_id: requestId
        });
      }
    }

    // Stuck jobs check
    const queuedJobsCount = await this.checkRepository.getCount('jobs', {
      eq: { status: 'queued' },
      lt: { created_at: thirtyMinutesAgo.toISOString() }
    });

    if (queuedJobsCount > 100) {
      alerts.push({
        tenant_id: null, alert_type: 'jobs_stuck', severity: 'high',
        title: `${queuedJobsCount} jobs em fila ha mais de 30 minutos`,
        message: 'Jobs nao estao sendo processados.',
        details: { queued_count: queuedJobsCount },
        trace_id: requestId
      });
    }

    if (alerts.length > 0) {
      for (const alert of alerts) {
        await this.checkRepository.createSystemAlert({ ...alert, acknowledged: false, created_at: now.toISOString() });
      }
    }

    const result = {
      success: true, checked_at: now.toISOString(), alerts_created: alerts.length,
      alerts: alerts.map(a => ({ type: a.alert_type, severity: a.severity, title: a.title }))
    };

    await this.checkRepository.logScheduledJobRun({
      p_job_key: 'check-production-health',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: alerts.length,
      p_job_source: 'cron'
    });

    return result;
  }
}
