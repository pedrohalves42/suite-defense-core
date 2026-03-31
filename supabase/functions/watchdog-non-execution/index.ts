/**
 * watchdog-non-execution - Detects agents online but not executing jobs
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { shouldProcessAlertsForTenant } from '../_shared/business-hours.ts';

interface AgentExecutionHealth {
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  status: string;
  last_heartbeat: string | null;
  agent_mode: string | null;
  minutes_since_heartbeat: number | null;
  last_execution_at: string | null;
  minutes_since_execution: number | null;
  stale_queued_jobs: number;
  stale_delivered_jobs: number;
  pending_jobs: number;
  health_status: string;
  severity: string;
  health_description: string;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  logger.info(`[${requestId}] Starting watchdog non-execution detection`);

  const { data: unhealthyAgents, error: queryError } = await supabase
    .from('v_agent_execution_health')
    .select('*')
    .neq('health_status', 'healthy')
    .neq('health_status', 'offline')
    .neq('health_status', 'never_connected');

  if (queryError) { logger.error(`[${requestId}] Query error: ${queryError.message}`); throw queryError; }

  if (!unhealthyAgents || unhealthyAgents.length === 0) {
    logger.info(`[${requestId}] No execution problems detected`);
    return { success: true, problems_detected: 0, message: 'All agents executing normally', timestamp: new Date().toISOString() };
  }

  logger.warn(`[${requestId}] Found ${unhealthyAgents.length} agent(s) with execution problems`);

  const problemsByType = unhealthyAgents.reduce((acc, agent) => {
    const status = agent.health_status as string;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const alertsCreated: Array<{ agent_name: string; health_status: string; severity: string }> = [];
  const alertsSkipped: string[] = [];
  const skippedDueToBusinessHours: string[] = [];
  const tenantBusinessHoursCache: Record<string, { shouldProcess: boolean; reason: string }> = {};

  // Batch dedup check
  const agentIds = (unhealthyAgents as AgentExecutionHealth[]).map(a => a.agent_id).filter(Boolean);
  const { data: recentAlerts } = await supabase
    .from('system_alerts').select('agent_id').in('agent_id', agentIds)
    .eq('alert_type', 'non_execution_detected').eq('resolved', false)
    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  const agentsWithRecentAlerts = new Set((recentAlerts || []).map(a => a.agent_id));

  for (const agent of unhealthyAgents as AgentExecutionHealth[]) {
    if (!tenantBusinessHoursCache[agent.tenant_id]) {
      tenantBusinessHoursCache[agent.tenant_id] = await shouldProcessAlertsForTenant(supabase, agent.tenant_id);
    }
    const { shouldProcess, reason } = tenantBusinessHoursCache[agent.tenant_id];
    if (!shouldProcess) { skippedDueToBusinessHours.push(agent.agent_name); continue; }

    if (agentsWithRecentAlerts.has(agent.agent_id)) { alertsSkipped.push(agent.agent_name); continue; }

    const { error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: agent.tenant_id, agent_id: agent.agent_id, alert_type: 'non_execution_detected',
      severity: agent.severity as 'low' | 'medium' | 'high' | 'critical',
      title: `Problema de execucao: ${agent.agent_name}`, message: agent.health_description, resolved: false,
      details: { health_status: agent.health_status, minutes_since_heartbeat: agent.minutes_since_heartbeat, minutes_since_execution: agent.minutes_since_execution, stale_queued_jobs: agent.stale_queued_jobs, stale_delivered_jobs: agent.stale_delivered_jobs, pending_jobs: agent.pending_jobs, agent_mode: agent.agent_mode, detected_at: new Date().toISOString(), watchdog_version: '1.0.0' },
    });

    if (!alertError) {
      alertsCreated.push({ agent_name: agent.agent_name, health_status: agent.health_status, severity: agent.severity });
      logger.info(`[${requestId}] Alert created for ${agent.agent_name}: ${agent.health_status}`);
    }
  }

  // Security logs per tenant
  const alertsByTenant = new Map<string, typeof alertsCreated>();
  for (const alert of alertsCreated) {
    const tid = (unhealthyAgents as AgentExecutionHealth[]).find(a => a.agent_name === alert.agent_name)?.tenant_id;
    if (tid) { if (!alertsByTenant.has(tid)) alertsByTenant.set(tid, []); alertsByTenant.get(tid)!.push(alert); }
  }
  if (alertsByTenant.size > 0) {
    const secLogs = [...alertsByTenant.entries()].map(([tid, alerts]) => ({ tenant_id: tid, event_type: 'watchdog_non_execution', severity: 'info', details: { request_id: requestId, alerts_created: alerts.length, agents_alerted: alerts.map(a => a.agent_name) } }));
    await supabase.from('security_logs').insert(secLogs);
  }

  const result = { success: true, problems_detected: unhealthyAgents.length, alerts_created: alertsCreated.length, alerts_skipped: alertsSkipped.length, skipped_outside_business_hours: skippedDueToBusinessHours.length, problems_by_type: problemsByType, agents: alertsCreated, timestamp: new Date().toISOString() };

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'watchdog-non-execution', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: result, p_processed_count: unhealthyAgents.length, p_job_source: 'cron' });

  return result;
});
