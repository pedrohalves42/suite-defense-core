// check-pending-agents.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class CheckPendingAgentsUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] CheckPendingAgentsUseCase: Starting check for pending agents...`);

    const agents = await this.checkRepository.getAgents({
      eq: { status: 'pending' }
    } as any);

    if (!agents || agents.length === 0) {
      return { success: true, message: 'No pending agents found', timestamp: new Date().toISOString() };
    }

    const agentsByTenant = agents.reduce((acc: any, agent: any) => {
      acc[agent.tenant_id] = acc[agent.tenant_id] || [];
      acc[agent.tenant_id].push(agent);
      return acc;
    }, {});

    let alertsCreated = 0;
    for (const [tenantId, tenantAgents] of Object.entries(agentsByTenant) as any) {
      const existing = await this.checkRepository.findExistingAlert({
        tenant_id: tenantId,
        alert_type: 'pending_agents',
        status: 'active'
      });

      if (!existing) {
        const agentsPending30Min = (tenantAgents as any[]).filter(a => (Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60 >= 30);
        
        await this.checkRepository.createSystemAlert({
          tenant_id: tenantId, alert_type: 'pending_agents',
          severity: agentsPending30Min.length > 0 ? 'high' : 'medium',
          title: `${tenantAgents.length} agente(s) pendente(s) de instalacao`,
          message: `Agentes pendentes: ${tenantAgents.map((a: any) => a.agent_name).join(', ')}`,
          details: { agents: tenantAgents.map((a: any) => ({ id: a.id, name: a.agent_name, enrolled_at: a.enrolled_at, minutes_pending: Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60) })), recommendation: 'Verifique se os instaladores foram executados corretamente.' },
          acknowledged: false, resolved: false
        });
        alertsCreated++;
      }
    }

    await this.checkRepository.logScheduledJobRun({
      p_job_key: 'check-pending-agents',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: { agents_checked: agents.length, alerts_created: alertsCreated },
      p_processed_count: agents.length,
      p_job_source: 'cron'
    });

    return { success: true, agents_checked: agents.length, alerts_created: alertsCreated };
  }
}
