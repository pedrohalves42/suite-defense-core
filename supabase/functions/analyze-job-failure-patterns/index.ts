/**
 * analyze-job-failure-patterns — Migrated to serveTenant middleware
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface FailurePattern {
  agent_id: string;
  agent_name: string;
  job_type: string;
  failure_count: number;
  total_count: number;
  failure_rate: number;
  common_errors: string[];
  last_failure: string;
}

interface TenantAnalysis {
  tenant_id: string;
  patterns: FailurePattern[];
  overall_failure_rate: number;
  recommendations: string[];
}

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, body } = ctx;
  const { hours_back = 24, threshold = 50 } = body as Record<string, number>;

  logger.info(`Analyzing job failure patterns for tenant ${tenantId}, last ${hours_back}h`);

  const cutoffTime = new Date(Date.now() - hours_back * 60 * 60 * 1000).toISOString();

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select(`id, tenant_id, agent_id, job_type, status, error_message, created_at, completed_at, agents!inner(agent_name)`)
    .eq('tenant_id', tenantId)
    .gte('created_at', cutoffTime)
    .in('status', ['completed', 'failed', 'error']);

  if (jobsError) {
    logger.error('Error fetching jobs:', jobsError);
    throw jobsError;
  }

  if (!jobs || jobs.length === 0) {
    return { message: 'No jobs found in the specified period', patterns: [], recommendations: [] };
  }

  // Group jobs by agent -> job_type
  const agentGroups = new Map<string, Map<string, typeof jobs>>();

  for (const job of jobs) {
    const agentKey = job.agent_id || 'unknown';
    if (!agentGroups.has(agentKey)) {
      agentGroups.set(agentKey, new Map());
    }
    const typeGroups = agentGroups.get(agentKey)!;
    if (!typeGroups.has(job.job_type)) {
      typeGroups.set(job.job_type, []);
    }
    typeGroups.get(job.job_type)!.push(job);
  }

  const patterns: FailurePattern[] = [];
  let tenantTotalJobs = 0;
  let tenantFailedJobs = 0;
  const insightsToCreate: Array<Record<string, unknown>> = [];
  const alertsToCreate: Array<Record<string, unknown>> = [];

  for (const [agentId, typeGroups] of agentGroups) {
    for (const [jobType, typeJobs] of typeGroups) {
      const totalCount = typeJobs.length;
      const failedJobs = typeJobs.filter(j => j.status === 'failed' || j.status === 'error');
      const failureCount = failedJobs.length;
      const failureRate = Math.round((failureCount / totalCount) * 100);

      tenantTotalJobs += totalCount;
      tenantFailedJobs += failureCount;

      if (failureRate >= threshold && totalCount >= 3) {
        const errorCounts = new Map<string, number>();
        for (const job of failedJobs) {
          const error = job.error_message?.substring(0, 100) || 'Unknown error';
          errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
        }
        const commonErrors = Array.from(errorCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([error]) => error);

        const lastFailure = failedJobs
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        const agentName = (((typeJobs[0] as Record<string, unknown>).agents as Record<string, unknown> | undefined)?.agent_name as string) || 'Unknown';

        patterns.push({
          agent_id: agentId, agent_name: agentName, job_type: jobType,
          failure_count: failureCount, total_count: totalCount, failure_rate: failureRate,
          common_errors: commonErrors, last_failure: lastFailure?.created_at || ''
        });

        if (failureRate >= 70) {
          insightsToCreate.push({
            tenant_id: tenantId, insight_type: 'job_failure_pattern',
            title: `Alta taxa de falha em ${jobType}`,
            description: `O agente ${agentName} esta com ${failureRate}% de falha em jobs do tipo ${jobType}. Ultimas ${hours_back}h: ${failureCount}/${totalCount} falharam.`,
            severity: failureRate >= 90 ? 'critical' : 'high', category: 'performance',
            affected_entity_type: 'agent', affected_entity_id: agentId,
            recommendation: generateRecommendation(jobType, commonErrors),
            metadata: { job_type: jobType, failure_rate: failureRate, failure_count: failureCount, total_count: totalCount, common_errors: commonErrors, agent_name: agentName },
            status: 'open', auto_generated: true
          });
        }
      }
    }
  }

  const overallFailureRate = tenantTotalJobs > 0 ? Math.round((tenantFailedJobs / tenantTotalJobs) * 100) : 0;

  const recommendations: string[] = [];
  if (overallFailureRate > 50) recommendations.push('Taxa de falha geral esta muito alta. Considere verificar conectividade dos agentes.');
  if (patterns.some(p => p.job_type.includes('web_activity'))) recommendations.push('Falhas em coleta de atividade web podem indicar problemas de permissao ou navegador nao instalado.');
  if (patterns.some(p => p.job_type.includes('software'))) recommendations.push('Falhas em inventario de software podem indicar timeout. Considere aumentar o tempo limite.');
  if (patterns.some(p => p.job_type.includes('vuln'))) recommendations.push('Falhas em scan de vulnerabilidades podem indicar falta de conectividade com base NVD.');

  if (overallFailureRate >= 50 && tenantTotalJobs >= 10) {
    alertsToCreate.push({
      tenant_id: tenantId, alert_type: 'high_job_failure_rate',
      title: `Taxa de falha de jobs em ${overallFailureRate}%`,
      message: `Nos ultimos ${hours_back}h, ${tenantFailedJobs} de ${tenantTotalJobs} jobs falharam.`,
      severity: overallFailureRate >= 70 ? 'critical' : 'high', status: 'active',
      metadata: { failure_rate: overallFailureRate, failed_count: tenantFailedJobs, total_count: tenantTotalJobs, patterns_count: patterns.length }
    });
  }

  // Insert insights (deduplicated)
  for (const insight of insightsToCreate) {
    const { data: existing } = await supabase.from('ai_insights').select('id')
      .eq('tenant_id', insight.tenant_id).eq('insight_type', insight.insight_type)
      .eq('affected_entity_id', insight.affected_entity_id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from('ai_insights').insert(insight);
    }
  }

  // Insert alerts (deduplicated)
  for (const alert of alertsToCreate) {
    const { data: existing } = await supabase.from('system_alerts').select('id')
      .eq('tenant_id', alert.tenant_id).eq('alert_type', alert.alert_type).eq('status', 'active').limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from('system_alerts').insert(alert);
    }
  }

  logger.info(`Analysis complete: ${insightsToCreate.length} insights, ${alertsToCreate.length} alerts`);

  return {
    analyses: [{ tenant_id: tenantId, patterns: patterns.sort((a, b) => b.failure_rate - a.failure_rate), overall_failure_rate: overallFailureRate, recommendations }],
    insights_created: insightsToCreate.length, alerts_created: alertsToCreate.length,
    period_hours: hours_back, threshold_percent: threshold
  };
});

function generateRecommendation(jobType: string, commonErrors: string[]): string {
  const recommendations: Record<string, string> = {
    'collect_web_activity': 'Verifique se o navegador esta instalado e se o agente tem permissao para acessar o historico.',
    'software_inventory_collect': 'Aumente o timeout do job ou verifique se ha muitos programas instalados causando lentidao.',
    'light_vuln_scan': 'Verifique conectividade com internet e se o firewall permite acesso as APIs de CVE.',
    'antivirus_status': 'Verifique se o antivirus esta instalado e acessivel pelo agente.',
    'system_metrics': 'Verifique permissoes do agente para acessar metricas do sistema.',
  };
  let rec = recommendations[jobType] || 'Verifique os logs do agente para mais detalhes sobre as falhas.';
  if (commonErrors.some(e => e.toLowerCase().includes('timeout'))) rec += ' Considere aumentar o timeout ou verificar a carga do sistema.';
  if (commonErrors.some(e => e.toLowerCase().includes('permission') || e.toLowerCase().includes('access'))) rec += ' Verifique as permissoes do agente no sistema operacional.';
  if (commonErrors.some(e => e.toLowerCase().includes('network') || e.toLowerCase().includes('connection'))) rec += ' Verifique a conectividade de rede do computador.';
  return rec;
}
