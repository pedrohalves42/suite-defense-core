// watchdog-non-execution.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';
import { isWithinBusinessHours } from '../../_shared/business-hours.ts';

interface AgentExecutionHealth {
  agent_id: string; agent_name: string; tenant_id: string; status: string;
  last_heartbeat: string | null; agent_mode: string | null;
  minutes_since_heartbeat: number | null; last_execution_at: string | null;
  minutes_since_execution: number | null; stale_queued_jobs: number;
  stale_delivered_jobs: number; pending_jobs: number;
  health_status: string; severity: string; health_description: string;
}

export class WatchdogNonExecutionUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, _payload: Record<string, unknown>) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] WatchdogNonExecutionUseCase: Starting detection`);

    const unhealthyAgents = await this.checkRepository.getUnhealthyAgents();

    if (!unhealthyAgents || unhealthyAgents.length === 0) {
      logger.info(`[${requestId}] WatchdogNonExecutionUseCase: No execution problems detected`);
      return { success: true, problems_detected: 0, message: 'All agents executing normally', timestamp: new Date().toISOString() };
    }

    logger.warn(`[${requestId}] WatchdogNonExecutionUseCase: Found ${unhealthyAgents.length} agent(s) with execution problems`);

    const problemsByType = unhealthyAgents.reduce((acc, agent) => {
      const status = agent.health_status as string;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsCreated: any[] = [];
    const alertsSkipped: string[] = [];
    const skippedDueToBusinessHours: string[] = [];

    const tenantIds = [...new Set(unhealthyAgents.map((a: any) => a.tenant_id))];
    const agentIds = unhealthyAgents.map((a: any) => a.agent_id).filter(Boolean);
    
    // Batch get business hours for all relevant tenants
    const businessHoursBatch = await this.checkRepository.getBusinessHoursBatch(tenantIds);
    
    // Check for recent alerts to avoid spamming
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: recentAlerts } = await (this.checkRepository as any).supabase
      .from('system_alerts').select('agent_id').in('agent_id', agentIds)
      .eq('alert_type', 'non_execution_detected').eq('resolved', false)
      .gte('created_at', twoHoursAgo);
    
    const agentsWithRecentAlerts = new Set((recentAlerts || []).map((a: any) => a.agent_id));

    const pendingAlerts: any[] = [];

    for (const agent of unhealthyAgents as AgentExecutionHealth[]) {
      const businessHours = businessHoursBatch[agent.tenant_id];
      const isWithinHours = !businessHours || !businessHours.enabled || isWithinBusinessHours(businessHours);
      
      if (!isWithinHours) { 
        skippedDueToBusinessHours.push(agent.agent_name); 
        continue; 
      }

      if (agentsWithRecentAlerts.has(agent.agent_id)) { 
        alertsSkipped.push(agent.agent_name); 
        continue; 
      }

      pendingAlerts.push({
        tenant_id: agent.tenant_id, 
        agent_id: agent.agent_id, 
        alert_type: 'non_execution_detected',
        severity: agent.severity as any,
        title: `Problema de execucao: ${agent.agent_name}`, 
        message: agent.health_description, 
        resolved: false,
        details: { 
          health_status: agent.health_status, 
          minutes_since_heartbeat: agent.minutes_since_heartbeat, 
          minutes_since_execution: agent.minutes_since_execution, 
          stale_queued_jobs: agent.stale_queued_jobs, 
          stale_delivered_jobs: agent.stale_delivered_jobs, 
          pending_jobs: agent.pending_jobs, 
          agent_mode: agent.agent_mode, 
          detected_at: new Date().toISOString(), 
          watchdog_version: '1.0.0' 
        },
      });
      
      alertsCreated.push({ agent_name: agent.agent_name, health_status: agent.health_status, severity: agent.severity });
    }

    if (pendingAlerts.length > 0) {
      await this.checkRepository.createSystemAlert(pendingAlerts);
      logger.info(`[${requestId}] WatchdogNonExecutionUseCase: ${pendingAlerts.length} alerts created in batch`);
    }


    // Security logs
    const alertsByTenant = new Map<string, typeof alertsCreated>();
    for (const alert of alertsCreated) {
      const tid = (unhealthyAgents as any[]).find(a => a.agent_name === alert.agent_name)?.tenant_id;
      if (tid) { if (!alertsByTenant.has(tid)) alertsByTenant.set(tid, []); alertsByTenant.get(tid)!.push(alert); }
    }
    
    if (alertsByTenant.size > 0) {
      const secLogs = [...alertsByTenant.entries()].map(([tid, alerts]) => ({
        tenant_id: tid, event_type: 'watchdog_non_execution', severity: 'info',
        details: { request_id: requestId, alerts_created: alerts.length, agents_alerted: alerts.map(a => a.agent_name) }
      }));
      await (this.checkRepository as any).supabase.from('security_logs').insert(secLogs);
    }

    const finalResult = {
      success: true,
      problems_detected: unhealthyAgents.length,
      alerts_created: alertsCreated.length,
      alerts_skipped: alertsSkipped.length,
      skipped_outside_business_hours: skippedDueToBusinessHours.length,
      problems_by_type: problemsByType,
      agents: alertsCreated,
      timestamp: new Date().toISOString()
    };

    await this.checkRepository.logScheduledJobRun({
      p_job_key: 'watchdog-non-execution',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: finalResult,
      p_processed_count: unhealthyAgents.length,
      p_job_source: 'cron'
    });

    return finalResult;
  }
}
