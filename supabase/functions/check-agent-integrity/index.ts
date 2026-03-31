/**
 * check-agent-integrity → Migrated to serveInternal middleware
 * Cron job (every 15 min) that detects agents removed after reboot or by antivirus.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { shouldProcessAlertsForTenant } from '../_shared/business-hours.ts';
import { logger } from '../_shared/logger.ts';

const PERSISTENT_FAILURE_THRESHOLD = 3;
const IMMEDIATE_ALERT_COOLDOWN_MS = 5 * 60 * 1000;

interface IntegrityCheckResult {
  agent_id: string; agent_name: string; tenant_id: string;
  issue_type: 'removed_after_reboot' | 'stale_after_active' | 'never_connected' | 'persistent_failure';
  last_heartbeat: string | null; enrolled_at: string;
  minutes_since_heartbeat: number | null; failure_count?: number;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();
  logger.info(`[${requestId}] Starting agent integrity check`);

  const { data: problematicAgents, error: queryError } = await supabase
    .from('agents').select('id, agent_name, tenant_id, status, last_heartbeat, enrolled_at, hostname, os_type')
    .eq('status', 'active').or(`last_heartbeat.is.null,last_heartbeat.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`);

  if (queryError) throw new Error(`Failed to query agents: ${queryError.message}`);
  logger.info(`[${requestId}] Found ${problematicAgents?.length || 0} agents with potential integrity issues`);

  const issues: IntegrityCheckResult[] = [];
  const alertsToCreate: Array<Record<string, unknown>> = [];
  const immediateAlertsToSend: Array<Record<string, unknown>> = [];
  const skippedDueToBusinessHours: string[] = [];
  const tenantBusinessHoursCache: Record<string, { shouldProcess: boolean; reason: string }> = {};

  const { data: existingPersistentAlerts } = await supabase.from('persistent_failure_alerts').select('id, agent_id, failure_count, last_alert_sent_at').eq('is_acknowledged', false);
  const persistentAlertsMap = new Map((existingPersistentAlerts || []).map(a => [a.agent_id, a]));

  for (const agent of problematicAgents || []) {
    if (!tenantBusinessHoursCache[agent.tenant_id]) {
      tenantBusinessHoursCache[agent.tenant_id] = await shouldProcessAlertsForTenant(supabase, agent.tenant_id);
    }
    if (!tenantBusinessHoursCache[agent.tenant_id].shouldProcess) { skippedDueToBusinessHours.push(agent.agent_name); continue; }

    let issueType: IntegrityCheckResult['issue_type'];
    let minutesSinceHeartbeat: number | null = null;

    if (!agent.last_heartbeat) { issueType = 'never_connected'; }
    else { minutesSinceHeartbeat = Math.floor((Date.now() - new Date(agent.last_heartbeat).getTime()) / (1000 * 60)); issueType = (minutesSinceHeartbeat > 30 && minutesSinceHeartbeat < 1440) ? 'removed_after_reboot' : 'stale_after_active'; }

    const existingAlert = persistentAlertsMap.get(agent.id);
    let failureCount = 1;

    if (existingAlert) {
      failureCount = (existingAlert.failure_count || 0) + 1;
      await supabase.from('persistent_failure_alerts').update({ failure_count: failureCount, last_failure_at: new Date().toISOString() }).eq('id', existingAlert.id);
      const lastAlertSent = existingAlert.last_alert_sent_at ? new Date(existingAlert.last_alert_sent_at).getTime() : 0;
      if (failureCount >= PERSISTENT_FAILURE_THRESHOLD && (Date.now() - lastAlertSent) > IMMEDIATE_ALERT_COOLDOWN_MS) {
        issueType = 'persistent_failure';
        immediateAlertsToSend.push({ alertId: existingAlert.id, agent, failureCount, minutesSinceHeartbeat });
      }
    } else if (issueType === 'removed_after_reboot') {
      await supabase.from('persistent_failure_alerts').insert({ tenant_id: agent.tenant_id, agent_id: agent.id, alert_type: 'agent_integrity_failure', failure_count: 1, first_failure_at: new Date().toISOString(), last_failure_at: new Date().toISOString(), metadata: { hostname: agent.hostname, os_type: agent.os_type, issue_type: issueType } });
    }

    issues.push({ agent_id: agent.id, agent_name: agent.agent_name, tenant_id: agent.tenant_id, issue_type: issueType, last_heartbeat: agent.last_heartbeat, enrolled_at: agent.enrolled_at, minutes_since_heartbeat: minutesSinceHeartbeat, failure_count: failureCount });

    if (issueType === 'removed_after_reboot') {
      alertsToCreate.push({ tenant_id: agent.tenant_id, agent_id: agent.id, alert_type: 'agent_integrity_failure', severity: 'high', message: `Computador "${agent.agent_name}" parou de responder apos possivel reinicio. Ultimo sinal ha ${minutesSinceHeartbeat} minutos.`, resolved: false, metadata: { issue_type: issueType, hostname: agent.hostname, os_type: agent.os_type, last_heartbeat: agent.last_heartbeat, minutes_since_heartbeat: minutesSinceHeartbeat } });
    }
  }

  for (const immediateAlert of immediateAlertsToSend) {
    try {
      const a = immediateAlert as { alertId: string; agent: Record<string, unknown>; failureCount: number; minutesSinceHeartbeat: number };
      await supabase.functions.invoke('security-alert-dispatcher', { body: { type: 'agent_persistent_failure', severity: 'critical', immediate: true, tenant_id: a.agent.tenant_id, agent_id: a.agent.id, agent_name: a.agent.agent_name, failure_count: a.failureCount, minutes_since_heartbeat: a.minutesSinceHeartbeat, message: `CRITICO: Agente "${a.agent.agent_name}" com ${a.failureCount} falhas consecutivas.` } });
      await supabase.from('persistent_failure_alerts').update({ last_alert_sent_at: new Date().toISOString() }).eq('id', a.alertId);
    } catch (alertError) { logger.warn(`[${requestId}] Failed to send immediate alert:`, alertError); }
  }

  if (alertsToCreate.length > 0) {
    // Batch: fetch all existing unresolved alerts for these agents in one query
    const alertAgentIds = alertsToCreate.map(a => a.agent_id);
    const alertTypes = [...new Set(alertsToCreate.map(a => a.alert_type))];
    const { data: existingAlerts } = await supabase.from('system_alerts').select('agent_id, alert_type').in('agent_id', alertAgentIds).in('alert_type', alertTypes).eq('resolved', false);
    const existingSet = new Set((existingAlerts || []).map(e => `${e.agent_id}:${e.alert_type}`));
    const newAlerts = alertsToCreate.filter(a => !existingSet.has(`${a.agent_id}:${a.alert_type}`));
    if (newAlerts.length > 0) {
      await supabase.from('system_alerts').insert(newAlerts);
    }
  }

  const agentsToDeactivate = issues.filter(i => i.minutes_since_heartbeat && i.minutes_since_heartbeat > 60).map(i => i.agent_id);
  if (agentsToDeactivate.length > 0) await supabase.from('agents').update({ status: 'inactive' }).in('id', agentsToDeactivate);

  // Batch insert agent_events instead of N+1
  const eventsToInsert = issues
    .filter(i => i.issue_type === 'removed_after_reboot' || i.issue_type === 'persistent_failure')
    .map(issue => ({
      agent_id: issue.agent_id,
      tenant_id: issue.tenant_id,
      event_type: issue.issue_type === 'persistent_failure' ? 'persistent_failure_detected' : 'integrity_check_failed',
      details: { issue_type: issue.issue_type, last_heartbeat: issue.last_heartbeat, minutes_since_heartbeat: issue.minutes_since_heartbeat, failure_count: issue.failure_count, detected_at: new Date().toISOString() }
    }));
  if (eventsToInsert.length > 0) {
    await supabase.from('agent_events').insert(eventsToInsert);
  }

  const durationMs = Date.now() - startedAt;
  const summary = { total_checked: problematicAgents?.length || 0, skipped_outside_business_hours: skippedDueToBusinessHours.length, removed_after_reboot: issues.filter(i => i.issue_type === 'removed_after_reboot').length, stale_after_active: issues.filter(i => i.issue_type === 'stale_after_active').length, never_connected: issues.filter(i => i.issue_type === 'never_connected').length, persistent_failures: issues.filter(i => i.issue_type === 'persistent_failure').length, alerts_created: alertsToCreate.length, immediate_alerts_sent: immediateAlertsToSend.length, agents_deactivated: agentsToDeactivate.length };

  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'check-agent-integrity', p_success: true, p_duration_ms: durationMs, p_result: summary, p_processed_count: problematicAgents?.length || 0, p_job_source: 'cron' }); } catch (logErr) { logger.warn(`[${requestId}] Failed to log job run:`, logErr); }

  logger.info(`[${requestId}] Integrity check completed in ${durationMs}ms:`, summary);
  return { success: true, requestId, timestamp: new Date().toISOString(), summary, issues: issues.slice(0, 50), duration_ms: durationMs };
});
