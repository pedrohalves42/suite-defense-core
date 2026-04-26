// analyze-job-failure-patterns.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class AnalyzeJobFailurePatternsUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, payload: Record<string, unknown>) {
    const tenantId = payload.tenant_id as string;
    const hoursBack = payload.hours_back as number || 24;
    const threshold = payload.threshold as number || 50;

    if (!tenantId) return { error: 'tenant_id required' };

    logger.info(`[${requestId}] AnalyzeJobFailurePatternsUseCase: Analyzing failures for tenant ${tenantId}`);

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    const jobs = await this.checkRepository.getJobs({
      tenant_id: tenantId,
      gte: { created_at: since }
    });

    const patterns: any[] = [];
    const insightsToCreate: any[] = [];
    const alertsToCreate: any[] = [];

    const jobsByAgent = (jobs || []).reduce((acc: any, job: any) => {
      acc[job.agent_id] = acc[job.agent_id] || [];
      acc[job.agent_id].push(job);
      return acc;
    }, {});

    let tenantTotalJobs = 0;
    let tenantFailedJobs = 0;

    for (const [agentId, agentJobs] of Object.entries(jobsByAgent) as any) {
      const jobsByType = (agentJobs as any[]).reduce((acc: any, job: any) => {
        acc[job.type] = acc[job.type] || [];
        acc[job.type].push(job);
        return acc;
      }, {});

      for (const [jobType, typeJobs] of Object.entries(jobsByType) as any) {
        const totalCount = typeJobs.length;
        const failedJobs = typeJobs.filter((j: any) => j.status === 'failed');
        const failureCount = failedJobs.length;
        
        tenantTotalJobs += totalCount;
        tenantFailedJobs += failureCount;

        if (totalCount >= 5) {
          const failureRate = Math.round((failureCount / totalCount) * 100);
          if (failureRate >= threshold) {
            const commonErrors = [...new Set(failedJobs.map((j: any) => j.error_message).filter(Boolean))].slice(0, 3);
            const lastFailure = failedJobs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            const agentName = (typeJobs[0] as any).agents?.agent_name || 'Unknown';

            patterns.push({
              agent_id: agentId, agent_name: agentName, job_type: jobType,
              failure_count: failureCount, total_count: totalCount, failure_rate: failureRate,
              common_errors: commonErrors, last_failure: lastFailure?.created_at || ''
            });

            if (failureRate >= 70) {
              insightsToCreate.push({
                tenant_id: tenantId, insight_type: 'job_failure_pattern',
                title: `Alta taxa de falha em ${jobType}`,
                description: `O agente ${agentName} esta com ${failureRate}% de falha em jobs do tipo ${jobType}. Ultimas ${hoursBack}h: ${failureCount}/${totalCount} falharam.`,
                severity: failureRate >= 90 ? 'critical' : 'high', category: 'performance',
                affected_entity_type: 'agent', affected_entity_id: agentId,
                recommendation: this.generateRecommendation(jobType, commonErrors as string[]),
                metadata: { job_type: jobType, failure_rate: failureRate, failure_count: failureCount, total_count: totalCount, common_errors: commonErrors, agent_name: agentName },
                status: 'open', auto_generated: true
              });
            }
          }
        }
      }
    }

    const overallFailureRate = tenantTotalJobs > 0 ? Math.round((tenantFailedJobs / tenantTotalJobs) * 100) : 0;
    const recommendations: string[] = [];
    if (overallFailureRate > 50) recommendations.push('Taxa de falha geral esta muito alta. Considere verificar conectividade dos agentes.');

    if (overallFailureRate >= 50 && tenantTotalJobs >= 10) {
      alertsToCreate.push({
        tenant_id: tenantId, alert_type: 'high_job_failure_rate',
        title: `Taxa de falha de jobs em ${overallFailureRate}%`,
        message: `Nos ultimos ${hoursBack}h, ${tenantFailedJobs} de ${tenantTotalJobs} jobs falharam.`,
        severity: overallFailureRate >= 70 ? 'critical' : 'high', status: 'active',
        metadata: { failure_rate: overallFailureRate, failed_count: tenantFailedJobs, total_count: tenantTotalJobs, patterns_count: patterns.length }
      });
    }

    for (const insight of insightsToCreate) {
      const existing = await this.checkRepository.findExistingInsight({
        tenant_id: insight.tenant_id,
        insight_type: insight.insight_type,
        affected_entity_id: insight.affected_entity_id,
        created_at_gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      } as any);
      if (!existing) {
        await this.checkRepository.createInsight(insight);
      }
    }

    for (const alert of alertsToCreate) {
      const existing = await this.checkRepository.findExistingAlert({
        tenant_id: alert.tenant_id,
        alert_type: alert.alert_type,
        status: 'active'
      });
      if (!existing) {
        await this.checkRepository.createSystemAlert(alert);
      }
    }

    return {
      success: true,
      analyses: [{ tenant_id: tenantId, patterns: patterns.sort((a, b) => b.failure_rate - a.failure_rate), overall_failure_rate: overallFailureRate, recommendations }],
      insights_created: insightsToCreate.length, alerts_created: alertsToCreate.length,
      period_hours: hoursBack, threshold_percent: threshold
    };
  }

  private generateRecommendation(jobType: string, errors: string[]): string {
    const errorStr = errors.join(' ').toLowerCase();
    if (errorStr.includes('timeout')) return 'Aumente o tempo limite de execucao para este tipo de job.';
    if (errorStr.includes('denied') || errorStr.includes('permission')) return 'Verifique as permissoes do agente no sistema operacional.';
    if (jobType.includes('web_activity')) return 'Certifique-se que o navegador suportado esta instalado e acessivel.';
    return 'Verifique os logs detalhados do agente para identificar a causa raiz.';
  }
}
