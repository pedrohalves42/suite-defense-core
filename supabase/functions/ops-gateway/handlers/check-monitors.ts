/**
 * Check monitors — Medium complexity inlined handlers (Sub-batch 2C-2)
 * monitor-thresholds, health-monitor, watchdog-non-execution, check-action-effectiveness, analyze-job-failure-patterns
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { shouldProcessAlertsForTenant } from '../../_shared/business-hours.ts';

type SB = any;

// ═══ monitor-thresholds ═══
export async function handleMonitorThresholds(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select(`id, name, tenant_settings!tenant_settings_tenant_id_fkey (
      alert_threshold_virus_positive, alert_threshold_failed_jobs,
      alert_threshold_offline_agents, enable_email_alerts,
      enable_webhook_alerts, alert_email, alert_webhook_url
    )`);

  if (tenantsError) throw tenantsError;

  logger.info(`[${requestId}] monitor-thresholds: Monitoring ${tenants?.length || 0} tenants`);

  const alerts: Array<{ tenant_id: string; tenant_name: string; virus: number; failed: number; offline: number; settings: Record<string, unknown> }> = [];

  for (const tenant of tenants || []) {
    // deno-lint-ignore no-explicit-any
    const settingsArr = (tenant as Record<string, any>).tenant_settings;
    if (!settingsArr || settingsArr.length === 0) continue;
    const settings = settingsArr[0];
    if (!settings.enable_email_alerts && !settings.enable_webhook_alerts) continue;

    const { count: virusCount } = await supabase
      .from('virus_scans').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).eq('is_malicious', true).gte('scanned_at', last24Hours);

    const { count: failedJobsCount } = await supabase
      .from('jobs').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).eq('status', 'failed').gte('created_at', last24Hours);

    const { count: offlineAgentsCount } = await supabase
      .from('agents').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).not('last_heartbeat', 'is', null).lt('last_heartbeat', last5Minutes);

    const virus = virusCount || 0;
    const failed = failedJobsCount || 0;
    const offline = offlineAgentsCount || 0;

    if (virus >= settings.alert_threshold_virus_positive || failed >= settings.alert_threshold_failed_jobs || offline >= settings.alert_threshold_offline_agents) {
      alerts.push({ tenant_id: tenant.id, tenant_name: tenant.name, virus, failed, offline, settings });
    }
  }

  const alertResults = [];
  for (const alert of alerts) {
    try {
      const issues: string[] = [];
      const s = alert.settings as Record<string, number>;
      if (alert.virus >= s.alert_threshold_virus_positive) issues.push(`${alert.virus} virus detectados`);
      if (alert.failed >= s.alert_threshold_failed_jobs) issues.push(`${alert.failed} jobs falhados`);
      if (alert.offline >= s.alert_threshold_offline_agents) issues.push(`${alert.offline} agentes offline`);

      const { handleNotifyEmail } = await import('./notify.ts');
      await handleNotifyEmail(supabase, requestId, {
        channel: 'email', type: 'system', severity: 'high',
        message: `Alertas de threshold excedidos para ${alert.tenant_name}`,
        metadata: { timeframe: 'Ultimas 24 horas', issues }, tenant_id: alert.tenant_id,
      });
      alertResults.push({ tenant_id: alert.tenant_id, success: true });
    } catch (error) {
      alertResults.push({ tenant_id: alert.tenant_id, success: false, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return {
    success: true,
    monitored_tenants: tenants?.length || 0,
    alerts_triggered: alerts.length,
    alerts_sent: alertResults.filter(r => r.success).length,
    timestamp: now.toISOString(),
  };
}

// ═══ health-monitor ═══
interface HealthResult {
  stuck_jobs: { count: number; failed: number };
  pending_agents: { count: number };
  installation_health: { tenants_checked: number; alerts: number };
  agent_health: { offline: number; total_active: number };
  dlq_exhaustion: { exhausted: number; alerts_created: number };
  slow_operations: { count: number };
  stuck_agents: { count: number };
  thresholds: { breaches: number };
  stuck_installations: { count: number };
  duration_ms: number;
}

export async function handleHealthMonitor(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();

  const result: HealthResult = {
    stuck_jobs: { count: 0, failed: 0 },
    pending_agents: { count: 0 },
    installation_health: { tenants_checked: 0, alerts: 0 },
    agent_health: { offline: 0, total_active: 0 },
    dlq_exhaustion: { exhausted: 0, alerts_created: 0 },
    slow_operations: { count: 0 },
    stuck_agents: { count: 0 },
    thresholds: { breaches: 0 },
    stuck_installations: { count: 0 },
    duration_ms: 0,
  };

  try {
    const results = await Promise.allSettled([
      (async () => {
        const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from('jobs').select('id, type, tenant_id').eq('status', 'delivered').lt('delivered_at', cutoff).limit(200);
        if (error) { logger.error('[health-monitor] stuck-jobs error:', error.message); return; }
        if (!data?.length) return;
        result.stuck_jobs.count = data.length;
        const ids = data.map(j => j.id);
        const { error: updateErr } = await supabase.from('jobs').update({ status: 'failed', error_message: 'Zombie: no result after timeout' }).in('id', ids);
        if (!updateErr) result.stuck_jobs.failed = ids.length;
      })(),
      (async () => {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from('agents').select('id, agent_name, tenant_id').is('last_heartbeat', null).lt('enrolled_at', cutoff).limit(100);
        if (error) { logger.error('[health-monitor] pending-agents error:', error.message); return; }
        result.pending_agents.count = data?.length || 0;
      })(),
      (async () => {
        const offlineCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from('agents').select('id, agent_name, tenant_id, last_heartbeat').eq('status', 'active').lt('last_heartbeat', offlineCutoff);
        if (error) { logger.error('[health-monitor] agent-health error:', error.message); return; }
        result.agent_health.offline = data?.length || 0;
        const { count } = await supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'active');
        result.agent_health.total_active = count || 0;
      })(),
      (async () => {
        const { data, error } = await supabase.from('failed_jobs_dlq').select('id, tenant_id, failure_class').eq('status', 'exhausted').limit(100);
        if (error) { logger.error('[health-monitor] dlq error:', error.message); return; }
        result.dlq_exhaustion.exhausted = data?.length || 0;
        if (data?.length) {
          const dlqIds = data.map(d => d.id);
          const { data: existing } = await supabase.from('dlq_exhaustion_alerts').select('dlq_item_id').in('dlq_item_id', dlqIds);
          const existingIds = new Set(existing?.map(e => e.dlq_item_id) || []);
          const newItems = data.filter(d => !existingIds.has(d.id));
          if (newItems.length) {
            const alerts = newItems.map(item => ({ dlq_item_id: item.id, tenant_id: item.tenant_id, severity: 'high', failure_class: item.failure_class }));
            await supabase.from('dlq_exhaustion_alerts').insert(alerts);
            result.dlq_exhaustion.alerts_created = newItems.length;
          }
        }
      })(),
      (async () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count, error } = await supabase.from('performance_metrics').select('id', { count: 'exact', head: true }).gt('duration_ms', 2000).gte('created_at', fiveMinAgo);
        if (error) { logger.error('[health-monitor] slow-ops error:', error.message); return; }
        result.slow_operations.count = count || 0;
      })(),
      (async () => {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from('agents').select('id, agent_name, tenant_id, enrolled_at').eq('status', 'pending').is('last_heartbeat', null).lt('enrolled_at', cutoff);
        if (error) { logger.error('[health-monitor] stuck-agents error:', error.message); return; }
        result.stuck_agents.count = data?.length || 0;
        if (data?.length) {
          const alerts = data.map(a => ({
            tenant_id: a.tenant_id, severity: 'medium', type: 'stuck_agent',
            message: `Agent '${a.agent_name}' stuck in pending for ${Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 60000)} min`,
            metadata: { agent_id: a.id, agent_name: a.agent_name },
          }));
          await supabase.from('system_alerts').insert(alerts);
        }
      })(),
      (async () => {
        const { data, error } = await supabase.from('v_agent_lifecycle_state').select('agent_id, tenant_id, agent_name').eq('is_stuck', true).limit(100);
        if (error) { logger.error('[health-monitor] stuck-install error:', error.message); return; }
        result.stuck_installations.count = data?.length || 0;
      })(),
    ]);

    results.forEach((r, i) => { if (r.status === 'rejected') logger.error(`[health-monitor] Check ${i} failed:`, r.reason); });

    result.duration_ms = Date.now() - startedAt;

    try { await supabase.rpc('update_cron_health', { p_cron_name: 'health-monitor', p_success: true, p_details: result }); } catch (_) { /* best effort */ }

    logger.info(`[health-monitor] Completed in ${result.duration_ms}ms`);
    return { success: true, ...result };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('[health-monitor] Fatal:', msg);
    try { await supabase.rpc('update_cron_health', { p_cron_name: 'health-monitor', p_success: false, p_details: { error: msg } }); } catch (_) { /* best effort */ }
    throw e;
  }
}

// ═══ watchdog-non-execution ═══
interface AgentExecutionHealth {
  agent_id: string; agent_name: string; tenant_id: string; status: string;
  last_heartbeat: string | null; agent_mode: string | null;
  minutes_since_heartbeat: number | null; last_execution_at: string | null;
  minutes_since_execution: number | null; stale_queued_jobs: number;
  stale_delivered_jobs: number; pending_jobs: number;
  health_status: string; severity: string; health_description: string;
}

export async function handleWatchdogNonExecution(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();

  logger.info(`[${requestId}] Starting watchdog non-execution detection`);

  const { data: unhealthyAgents, error: queryError } = await supabase
    .from('v_agent_execution_health').select('agent_id, agent_name, tenant_id, last_job_completed_at, stale_delivered_jobs, pending_jobs, health_status, severity, health_description')
    .neq('health_status', 'healthy').neq('health_status', 'offline').neq('health_status', 'never_connected');

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
    const { shouldProcess } = tenantBusinessHoursCache[agent.tenant_id];
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

  const alertsByTenant = new Map<string, typeof alertsCreated>();
  for (const alert of alertsCreated) {
    const tid = (unhealthyAgents as AgentExecutionHealth[]).find(a => a.agent_name === alert.agent_name)?.tenant_id;
    if (tid) { if (!alertsByTenant.has(tid)) alertsByTenant.set(tid, []); alertsByTenant.get(tid)!.push(alert); }
  }
  if (alertsByTenant.size > 0) {
    const secLogs = [...alertsByTenant.entries()].map(([tid, alerts]) => ({ tenant_id: tid, event_type: 'watchdog_non_execution', severity: 'info', details: { request_id: requestId, alerts_created: alerts.length, agents_alerted: alerts.map(a => a.agent_name) } }));
    await supabase.from('security_logs').insert(secLogs);
  }

  const finalResult = { success: true, problems_detected: unhealthyAgents.length, alerts_created: alertsCreated.length, alerts_skipped: alertsSkipped.length, skipped_outside_business_hours: skippedDueToBusinessHours.length, problems_by_type: problemsByType, agents: alertsCreated, timestamp: new Date().toISOString() };

  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'watchdog-non-execution', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: finalResult, p_processed_count: unhealthyAgents.length, p_job_source: 'cron' });

  return finalResult;
}

// ═══ check-action-effectiveness ═══
type EffectivenessResult = { status: 'resolved' | 'partial' | 'failed' | 'unknown'; evidence: Record<string, unknown>; reason: string; };

async function checkDnsActivity(supabase: SB, agentId: string, actionCreatedAt: string, originalEvidence: Record<string, unknown>): Promise<EffectivenessResult> {
  const domain = originalEvidence?.domain || originalEvidence?.blocked_domain;
  if (!domain) return { status: 'unknown', evidence: {}, reason: 'No domain in original evidence' };

  const { data: recentActivity, error } = await supabase
    .from('agent_web_activity').select('id, domain, visited_at, is_blocked')
    .eq('agent_id', agentId).eq('domain', domain).gt('visited_at', actionCreatedAt).limit(10);

  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };

  const activities = recentActivity as Array<{ id: string; domain: string; visited_at: string; is_blocked: boolean }> || [];
  const attempts = activities.length;
  const blockedAttempts = activities.filter(a => a.is_blocked).length;

  if (attempts === 0) return { status: 'resolved', evidence: { domain, attempts_after_action: 0 }, reason: `Nenhuma tentativa de acesso ao dominio ${domain} apos o bloqueio` };
  if (blockedAttempts === attempts) return { status: 'resolved', evidence: { domain, attempts, all_blocked: true }, reason: `Todas ${attempts} tentativas foram bloqueadas` };
  return { status: 'partial', evidence: { domain, attempts, blocked: blockedAttempts, unblocked: attempts - blockedAttempts }, reason: `${attempts - blockedAttempts} tentativa(s) nao bloqueada(s)` };
}

async function checkAntivirusStatus(supabase: SB, agentId: string, actionCreatedAt: string, expectedState: string): Promise<EffectivenessResult> {
  const { data: avStatus, error } = await supabase
    .from('antivirus_status').select('status, engine_name, last_update_at')
    .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(1).single();

  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Failed to fetch AV status' };
  if (!avStatus) return { status: 'unknown', evidence: {}, reason: 'No AV status found' };

  const isResolved = expectedState === 'enabled' ? avStatus.status === 'active' || avStatus.status === 'enabled' : !!avStatus.last_update_at && new Date(avStatus.last_update_at) > new Date(actionCreatedAt);
  return { status: isResolved ? 'resolved' : 'failed', evidence: { engine: avStatus.engine_name, status: avStatus.status, last_update: avStatus.last_update_at }, reason: isResolved ? `Antivirus ${expectedState}` : `Antivirus still not ${expectedState}` };
}

async function checkSafeModeResolved(supabase: SB, agentId: string): Promise<EffectivenessResult> {
  const { data: agent, error } = await supabase.from('agents').select('safe_mode, safe_mode_reason, last_heartbeat').eq('id', agentId).single();
  if (error || !agent) return { status: 'unknown', evidence: { error: error?.message }, reason: 'Agent not found' };
  return { status: agent.safe_mode ? 'failed' : 'resolved', evidence: { safe_mode: agent.safe_mode, reason: agent.safe_mode_reason }, reason: agent.safe_mode ? 'Still in safe mode' : 'Exited safe mode' };
}

async function checkAgentOnline(supabase: SB, agentId: string): Promise<EffectivenessResult> {
  const { data: agent, error } = await supabase.from('agents').select('status, last_heartbeat').eq('id', agentId).single();
  if (error || !agent) return { status: 'unknown', evidence: { error: error?.message }, reason: 'Agent not found' };
  const isOnline = agent.status === 'active' && agent.last_heartbeat && (Date.now() - new Date(agent.last_heartbeat).getTime()) < 10 * 60 * 1000;
  return { status: isOnline ? 'resolved' : 'failed', evidence: { status: agent.status, last_heartbeat: agent.last_heartbeat }, reason: isOnline ? 'Agent is back online' : 'Agent still offline' };
}

async function checkVulnerabilityFixed(supabase: SB, agentId: string, originalEvidence: Record<string, unknown>): Promise<EffectivenessResult> {
  const cveId = originalEvidence?.cve_id || originalEvidence?.vulnerability_id;
  if (!cveId) return { status: 'unknown', evidence: {}, reason: 'No CVE ID in evidence' };
  const { data: vuln, error } = await supabase.from('vuln_findings').select('id, status').eq('agent_id', agentId).eq('cve_id', cveId).single();
  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  if (!vuln) return { status: 'resolved', evidence: { cve_id: cveId }, reason: `Vulnerability ${cveId} no longer detected` };
  return { status: vuln.status === 'fixed' ? 'resolved' : 'failed', evidence: { cve_id: cveId, status: vuln.status }, reason: vuln.status === 'fixed' ? `${cveId} fixed` : `${cveId} still ${vuln.status}` };
}

export async function handleCheckActionEffectiveness(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();

  logger.info('[check-action-effectiveness] Starting verification run');

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: actions, error: fetchError } = await supabase
    .from('ai_actions')
    .select(`id, insight_id, action_type, executed_at, result, ai_insights!inner ( id, insight_type, agent_id, evidence, tenant_id )`)
    .eq('effectiveness_status', 'pending').eq('status', 'executed').lt('executed_at', tenMinutesAgo).limit(20);

  if (fetchError) { logger.error('[check-action-effectiveness] Error fetching actions:', fetchError); throw fetchError; }

  logger.info(`[check-action-effectiveness] Found ${actions?.length || 0} actions to verify`);

  const results: Array<{ actionId: string; status: string; reason: string }> = [];

  for (const action of actions ?? []) {
    const insightData = action.ai_insights;
    const insight = Array.isArray(insightData) ? insightData[0] : insightData;
    if (!insight) continue;

    const insight_type = insight.insight_type as string;
    const agent_id = insight.agent_id as string;
    const evidence = insight.evidence as Record<string, unknown>;
    const originalEvidence = evidence || {};

    let result: EffectivenessResult;
    logger.info(`[check-action-effectiveness] Checking ${insight_type} for agent ${agent_id}`);

    switch (insight_type) {
      case 'dns_malicious_activity':
      case 'dns_c2_communication':
        result = await checkDnsActivity(supabase, agent_id, action.executed_at, originalEvidence); break;
      case 'antivirus_disabled':
        result = await checkAntivirusStatus(supabase, agent_id, action.executed_at, 'enabled'); break;
      case 'antivirus_outdated':
        result = await checkAntivirusStatus(supabase, agent_id, action.executed_at, 'updated'); break;
      case 'safe_mode_prolonged':
        result = await checkSafeModeResolved(supabase, agent_id); break;
      case 'agent_offline_suspicious':
      case 'agent_offline_critical':
        result = await checkAgentOnline(supabase, agent_id); break;
      case 'vulnerability_critical':
      case 'vulnerability_high':
        result = await checkVulnerabilityFixed(supabase, agent_id, originalEvidence); break;
      default:
        result = { status: 'unknown', evidence: { note: 'No specific verification strategy for this insight type' }, reason: `Verificacao automatica nao disponivel para ${insight_type}` };
    }

    await supabase.from('ai_actions').update({ effectiveness_status: result.status, effectiveness_checked_at: new Date().toISOString(), effectiveness_evidence: result.evidence }).eq('id', action.id);

    const finalOutcome = result.status === 'unknown' ? null : result.status;
    if (finalOutcome) {
      await supabase.from('ai_insights').update({ final_outcome: finalOutcome }).eq('id', insight.id);
    }

    results.push({ actionId: action.id, status: result.status, reason: result.reason });
    logger.info(`[check-action-effectiveness] Action ${action.id}: ${result.status} - ${result.reason}`);
  }

  const durationMs = Date.now() - startedAt;
  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-action-effectiveness', p_success: true, p_duration_ms: durationMs,
    p_result: { actions_checked: results.length, resolved: results.filter(r => r.status === 'resolved').length, failed: results.filter(r => r.status === 'failed').length, partial: results.filter(r => r.status === 'partial').length, unknown: results.filter(r => r.status === 'unknown').length },
    p_processed_count: results.length, p_job_source: 'cron',
  });

  logger.info(`[check-action-effectiveness] Completed. Checked ${results.length} actions in ${durationMs}ms`);

  return { success: true, checked: results.length, results, duration_ms: durationMs };
}

// ═══ analyze-job-failure-patterns ═══
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

export async function handleAnalyzeJobFailurePatterns(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { error: 'tenant_id required in payload' };

  const hoursBack = (payload.hours_back as number) || 24;
  const threshold = (payload.threshold as number) || 50;

  logger.info(`Analyzing job failure patterns for tenant ${tenantId}, last ${hoursBack}h`);

  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select(`id, tenant_id, agent_id, job_type, status, error_message, created_at, completed_at, agents!inner(agent_name)`)
    .eq('tenant_id', tenantId)
    .gte('created_at', cutoffTime)
    .in('status', ['completed', 'failed', 'error']);

  if (jobsError) { logger.error('Error fetching jobs:', jobsError); throw jobsError; }

  if (!jobs || jobs.length === 0) {
    return { message: 'No jobs found in the specified period', patterns: [], recommendations: [] };
  }

  const agentGroups = new Map<string, Map<string, typeof jobs>>();

  for (const job of jobs) {
    const agentKey = job.agent_id || 'unknown';
    if (!agentGroups.has(agentKey)) agentGroups.set(agentKey, new Map());
    const typeGroups = agentGroups.get(agentKey)!;
    if (!typeGroups.has(job.job_type)) typeGroups.set(job.job_type, []);
    typeGroups.get(job.job_type)!.push(job);
  }

  interface FailurePattern {
    agent_id: string; agent_name: string; job_type: string;
    failure_count: number; total_count: number; failure_rate: number;
    common_errors: string[]; last_failure: string;
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
        const commonErrors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([error]) => error);

        const lastFailure = failedJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

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
            description: `O agente ${agentName} esta com ${failureRate}% de falha em jobs do tipo ${jobType}. Ultimas ${hoursBack}h: ${failureCount}/${totalCount} falharam.`,
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
      message: `Nos ultimos ${hoursBack}h, ${tenantFailedJobs} de ${tenantTotalJobs} jobs falharam.`,
      severity: overallFailureRate >= 70 ? 'critical' : 'high', status: 'active',
      metadata: { failure_rate: overallFailureRate, failed_count: tenantFailedJobs, total_count: tenantTotalJobs, patterns_count: patterns.length }
    });
  }

  for (const insight of insightsToCreate) {
    const { data: existing } = await supabase.from('ai_insights').select('id')
      .eq('tenant_id', insight.tenant_id).eq('insight_type', insight.insight_type)
      .eq('affected_entity_id', insight.affected_entity_id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from('ai_insights').insert(insight);
    }
  }

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
    period_hours: hoursBack, threshold_percent: threshold
  };
}
