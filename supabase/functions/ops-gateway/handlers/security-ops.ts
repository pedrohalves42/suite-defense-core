/**
 * Security Operations Handlers — Inlined from standalone serveInternal functions
 * For ops-gateway: auto-quarantine, quarantine-agent, apply-security-patch,
 * detect-blocked-attempts, security-monitor, security-alert-dispatcher,
 * integrity-sentinel, populate-security-graph, publish-threat-ioc
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { createAuditLog } from '../../_shared/audit.ts';
import { healthProbeMiddleware, updateJobHeartbeat, EDGE_VERSION } from '../../_shared/health-probe.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// ─── auto-quarantine ────────────────────────────────────────────────────────

export async function handleAutoQuarantine(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const { virus_scan_id, agent_name, file_path, file_hash, positives, total_scans } = payload as {
    virus_scan_id: string; agent_name: string; file_path: string; file_hash: string; positives: number; total_scans: number;
  };
  if (!virus_scan_id || !agent_name || !file_path || !file_hash) return { __status: 400, error: 'virus_scan_id, agent_name, file_path, file_hash required' };

  const { data: agent, error: agentError } = await supabase.from('agents').select('tenant_id')
    .eq('agent_name', agent_name).order('enrolled_at', { ascending: false }).limit(1).maybeSingle();
  if (agentError || !agent) throw new Error('Agent not found');

  const tenant_id = agent.tenant_id;
  const { data: settings } = await supabase.from('tenant_settings').select('enable_auto_quarantine')
    .eq('tenant_id', tenant_id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!settings?.enable_auto_quarantine) return { message: 'Auto-quarantine is disabled' };

  const quarantine_reason = `Arquivo malicioso detectado: ${positives}/${total_scans} engines reportaram positivo`;
  const { data: quarantined, error: quarantineError } = await supabase.from('quarantined_files')
    .insert({ tenant_id, agent_name, file_path, file_hash, virus_scan_id, quarantine_reason, status: 'quarantined' })
    .select().order('quarantined_at', { ascending: false }).limit(1).maybeSingle();
  if (quarantineError) throw quarantineError;

  logger.info(`[${requestId}] AUTO-QUARANTINE: File quarantined: ${quarantined.id}`);

  await supabase.functions.invoke('ops-gateway', {
    headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
    body: { action: 'notify:security', payload: { event: 'virus_detected', severity: 'critical', tenantId: tenant_id, agentName: agent_name, details: { file_path, file_hash, positives, total_scans, quarantine_id: quarantined.id, virus_scan_id } } }
  });

  return { success: true, quarantine_id: quarantined.id, message: 'File quarantined successfully' };
}

// ─── quarantine-agent ───────────────────────────────────────────────────────

export async function handleQuarantineAgent(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const { agent_id, quarantine_reason, severity = 'high', duration_hours = 24, restrict_network = true, restrict_processes = true, restrict_file_access = true } = payload as {
    agent_id: string; quarantine_reason: string; severity?: string; duration_hours?: number; restrict_network?: boolean; restrict_processes?: boolean; restrict_file_access?: boolean;
  };
  if (!agent_id || !quarantine_reason) return { __status: 400, error: 'agent_id, quarantine_reason required' };

  const { data: agent, error: agentError } = await supabase.from('agents').select('id, agent_name, tenant_id, status').eq('id', agent_id).single();
  if (agentError || !agent) return { __status: 404, error: 'Agent not found' };

  const quarantineEnd = new Date(Date.now() + duration_hours * 60 * 60 * 1000);
  const { data: record, error: qError } = await supabase.from('agent_quarantine').insert({
    agent_id, tenant_id: agent.tenant_id, quarantine_reason, severity, duration_hours,
    restrict_network, restrict_processes, restrict_file_access, quarantined_by: 'system',
    quarantine_end: quarantineEnd.toISOString(), status: 'active',
  }).select('id').single();
  if (qError) throw new Error(`Failed to create quarantine: ${qError.message}`);

  await supabase.from('agents').update({ status: 'quarantined', updated_at: new Date().toISOString() }).eq('id', agent_id);
  await supabase.from('jobs').update({ status: 'cancelled', error_message: `[CANCELLED:AGENT_QUARANTINED] ${quarantine_reason}`, completed_at: new Date().toISOString() }).eq('agent_id', agent_id).in('status', ['pending', 'queued']);

  await supabase.from('system_alerts').insert({
    tenant_id: agent.tenant_id, agent_id, alert_type: 'quarantine', severity,
    title: 'Agent Quarantined', message: `Agent "${agent.agent_name}" quarantined: ${quarantine_reason}`,
    details: { quarantine_id: record?.id, duration_hours, restrict_network, restrict_processes, restrict_file_access, quarantine_end: quarantineEnd.toISOString() },
  });

  await supabase.from('domain_events').insert({
    aggregate_id: agent_id, aggregate_type: 'agent', event_type: 'AgentQuarantined',
    payload: { reason: quarantine_reason, severity, duration_hours, quarantine_id: record?.id },
    occurred_on: new Date().toISOString(), tenant_id: agent.tenant_id,
  });

  return { success: true, quarantine_id: record?.id, agent_name: agent.agent_name, quarantine_end: quarantineEnd.toISOString() };
}

// ─── apply-security-patch ───────────────────────────────────────────────────

export async function handleApplySecurityPatch(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const { cve_id, agent_ids, patch_method = 'automatic' } = payload as { cve_id: string; agent_ids?: string[]; patch_method?: string };
  if (!cve_id) return { __status: 400, error: 'cve_id required' };

  const { data: cve, error: cveError } = await supabase.from('cve_database').select('*').eq('cve_id', cve_id).maybeSingle();
  if (cveError || !cve) return { __status: 404, error: `CVE ${cve_id} not found` };

  let agentsQuery = supabase.from('vuln_findings').select('agent_id, agent_name, tenant_id').eq('cve_id', cve_id).eq('status', 'open');
  if (agent_ids?.length) agentsQuery = agentsQuery.in('agent_id', agent_ids);
  const { data: affectedAgents, error: agentsError } = await agentsQuery;
  if (agentsError) throw agentsError;
  if (!affectedAgents?.length) return { success: true, message: 'No affected agents found', cve_id, patched_count: 0 };

  const jobs = affectedAgents.map(agent => ({
    type: 'apply_security_patch', agent_name: agent.agent_name, tenant_id: agent.tenant_id, status: 'pending',
    payload: { cve_id, patch_method, severity: cve.severity, affected_product: cve.affected_products?.[0] || 'unknown' },
  }));
  const { error: jobsError } = await supabase.from('jobs').insert(jobs);
  if (jobsError) throw jobsError;

  await supabase.from('vuln_findings').update({ status: 'patching' }).eq('cve_id', cve_id).in('agent_id', affectedAgents.map(a => a.agent_id));

  return { success: true, cve_id, patched_count: jobs.length, patch_method, severity: cve.severity };
}

// ─── detect-blocked-attempts ────────────────────────────────────────────────

export async function handleDetectBlockedAttemptsSecurity(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const startedAt = Date.now();
  const timeoutMs = 20000;
  const rpcPromise = supabase.rpc('detect_blocked_access_attempts');
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout after 20s')), timeoutMs));

  try {
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: unknown; error: Record<string, unknown> | null };
    if (error) {
      const isTimeout = error.code === '57014' || (error.message as string)?.includes('timeout');
      try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: isTimeout ? 'RPC timeout' : (error.message as string), p_result: null, p_processed_count: 0, p_job_source: 'cron' }); } catch (_) { /* best effort */ }
      return { __status: isTimeout ? 504 : 500, status: isTimeout ? 'timeout' : 'error', error: isTimeout ? 'Query timed out' : (error.message as string), requestId };
    }
    const insertedCount = (data as Record<string, unknown>[])?.[0]?.inserted_count ?? 0;
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { inserted_count: insertedCount }, p_processed_count: insertedCount as number, p_job_source: 'cron' }); } catch (_) { /* best effort */ }
    return { status: 'ok', inserted_count: insertedCount, duration_ms: Date.now() - startedAt, requestId };
  } catch (err) {
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-blocked-attempts', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: err instanceof Error ? err.message : 'Unknown', p_result: null, p_processed_count: 0, p_job_source: 'cron' }); } catch (_) { /* best effort */ }
    return { __status: 504, status: 'timeout', error: err instanceof Error ? err.message : 'Unknown', requestId };
  }
}

// ─── security-monitor ───────────────────────────────────────────────────────

export async function handleSecurityMonitor(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const startedAt = Date.now();
  const result = { credential_rotation: { tokens_warning: 0, tokens_expired: 0 }, expiring_keys: { keys_found: 0, notifications_sent: 0 }, duration_ms: 0 };

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const [rotationResult, keysResult] = await Promise.allSettled([
    (async () => {
      const { data: expiredTokens } = await supabase.from('agent_tokens').select('id, agent_id, tenant_id').lt('rotated_at', ninetyDaysAgo).eq('is_active', true).limit(200);
      result.credential_rotation.tokens_expired = expiredTokens?.length || 0;
      const { data: warningTokens } = await supabase.from('agent_tokens').select('id, agent_id, tenant_id').lt('rotated_at', sixtyDaysAgo).gte('rotated_at', ninetyDaysAgo).eq('is_active', true).limit(200);
      result.credential_rotation.tokens_warning = warningTokens?.length || 0;
      if (expiredTokens?.length) {
        const tenantIds = [...new Set(expiredTokens.map(t => t.tenant_id))];
        for (const tenantId of tenantIds) {
          const count = expiredTokens.filter(t => t.tenant_id === tenantId).length;
          await supabase.from('system_alerts').upsert({ tenant_id: tenantId, type: 'credential_rotation_overdue', severity: 'high', message: `${count} agent token(s) overdue for rotation (>90 days)`, metadata: { count, check: 'security-monitor' } }, { onConflict: 'tenant_id,type' });
        }
      }
    })(),
    (async () => {
      const { data: expiringKeys, error } = await supabase.from('enrollment_keys').select('id, key, expires_at, description, tenant_id').lt('expires_at', oneHourFromNow).gt('expires_at', now).is('expiration_notified_at', null).eq('is_active', true);
      if (error) { logger.error(`[${requestId}] security-monitor: expiring-keys error:`, error.message); return; }
      result.expiring_keys.keys_found = expiringKeys?.length || 0;
      if (expiringKeys?.length) {
        const keyIds = expiringKeys.map(k => k.id);
        await supabase.from('enrollment_keys').update({ expiration_notified_at: now }).in('id', keyIds);
        result.expiring_keys.notifications_sent = keyIds.length;
        const byTenant = new Map<string, number>();
        expiringKeys.forEach(k => byTenant.set(k.tenant_id, (byTenant.get(k.tenant_id) || 0) + 1));
        for (const [tenantId, count] of byTenant) {
          await supabase.from('system_alerts').insert({ tenant_id: tenantId, type: 'enrollment_key_expiring', severity: 'warning', message: `${count} enrollment key(s) expiring within 1 hour`, metadata: { count, check: 'security-monitor' } });
        }
      }
    })(),
  ]);

  [rotationResult, keysResult].forEach((r, i) => { if (r.status === 'rejected') logger.error(`[${requestId}] security-monitor: Check ${i} failed:`, r.reason); });
  result.duration_ms = Date.now() - startedAt;
  try { await supabase.rpc('update_cron_health', { p_cron_name: 'security-monitor', p_success: true, p_details: result }); } catch (_) { /* */ }
  return { success: true, ...result };
}

// ─── security-alert-dispatcher ──────────────────────────────────────────────

function parseInterval(interval: string): number {
  if (!interval) return 0;
  const hhmmss = interval.match(/^(\d+):(\d+):(\d+)/);
  if (hhmmss) return (parseInt(hhmmss[1], 10) * 3600 + parseInt(hhmmss[2], 10) * 60 + parseInt(hhmmss[3], 10)) * 1000;
  const minMatch = interval.match(/(\d+)\s*minute/i);
  if (minMatch) return parseInt(minMatch[1], 10) * 60 * 1000;
  const hourMatch = interval.match(/(\d+)\s*hour/i);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 3600 * 1000;
  return 0;
}

async function createSystemAlert(supabase: SupabaseClient, alertType: string, severity: string, message: string) {
  try { await supabase.from('system_alerts').insert({ alert_type: alertType, severity, message, resolved: false }); }
  catch (error) { logger.error('Failed to create system alert:', error); }
}

export async function handleSecurityAlertDispatcher(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  logger.info(`[${requestId}] Security alert dispatcher started - Edge v${EDGE_VERSION}`);
  const healthCheck = await healthProbeMiddleware(supabase, {});
  if (healthCheck) return healthCheck;
  await updateJobHeartbeat(supabase, 'security-alert-dispatcher', '5 minutes');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const tenMinutesAgo = new Date(now.getTime() - 600000);

  const { data: rateLimitData } = await supabase.from('rate_limits').select('*').gte('window_start', oneHourAgo.toISOString()).not('blocked_until', 'is', null);
  const rateLimitBreaches = rateLimitData?.length || 0;
  const { data: replayData } = await supabase.rpc('get_replay_attempts', { hours_back: 1 });
  const replayAttempts = replayData?.[0]?.attempt_count || 0;
  const { data: failedLoginData } = await supabase.from('failed_login_attempts').select('ip_address, count(*)', { count: 'exact' }).gte('created_at', tenMinutesAgo.toISOString());
  const ipCounts: Record<string, number> = {};
  failedLoginData?.forEach((a: Record<string, unknown>) => { const ip = a.ip_address as string; ipCounts[ip] = (ipCounts[ip] || 0) + 1; });
  const failedLoginSpikes = Object.entries(ipCounts).filter(([, count]) => count >= 5).length;
  const { data: blockedIpData } = await supabase.from('ip_blocklist').select('*').gte('blocked_until', now.toISOString());
  const { data: securityEventsData } = await supabase.from('security_logs').select('*').gte('created_at', oneHourAgo.toISOString()).in('severity', ['high', 'critical']);
  const criticalEvents = securityEventsData?.length || 0;

  const metrics = { rate_limit_breaches: rateLimitBreaches, replay_attempts: replayAttempts, failed_logins: failedLoginSpikes, blocked_ips: blockedIpData?.length || 0, critical_events: criticalEvents };
  const alerts: string[] = [];

  if (rateLimitBreaches > 5) { alerts.push(`High rate limit breaches: ${rateLimitBreaches}`); await createSystemAlert(supabase, 'rate_limit_breach', 'warning', `${rateLimitBreaches} rate limit breaches detected`); }
  if (replayAttempts > 0) { alerts.push(`Replay attack attempts: ${replayAttempts}`); await createSystemAlert(supabase, 'replay_attack', 'critical', `${replayAttempts} potential replay attack attempts`); }
  if (failedLoginSpikes > 0) { alerts.push(`Failed login spikes from ${failedLoginSpikes} IPs`); await createSystemAlert(supabase, 'failed_login_spike', 'warning', `Failed login spikes from ${failedLoginSpikes} IPs`); }
  if (criticalEvents > 10) { alerts.push(`High critical events: ${criticalEvents}`); await createSystemAlert(supabase, 'critical_event_spike', 'critical', `${criticalEvents} critical security events`); }

  try {
    const { data: silentJobs, error: sjError } = await supabase.from('v_cron_silence').select('*');
    if (!sjError && silentJobs?.length) {
      const criticalSilentJobs = silentJobs.filter((job: Record<string, unknown>) => parseInterval(job.silence_duration as string) > parseInterval(job.expected_interval as string) * 2);
      if (criticalSilentJobs.length > 0) {
        const jobNames = criticalSilentJobs.map((j: Record<string, unknown>) => j.job_key).join(', ');
        alerts.push(`Silent cron jobs: ${jobNames}`);
        await createSystemAlert(supabase, 'cron_silence', 'critical', `${criticalSilentJobs.length} scheduled jobs stopped: ${jobNames}`);
      }
    }
  } catch (cronError) { logger.warn(`[${requestId}] Cron silence check failed:`, cronError); }

  await supabase.from('security_logs').insert({ event_type: 'security_scan', severity: alerts.length > 0 ? 'warning' : 'info', ip_address: 'system', endpoint: '/ops-gateway/security:security-alert-dispatcher', details: { metrics, alerts, request_id: requestId }, blocked: false });
  try { await supabase.rpc('update_cron_health', { p_cron_name: 'security-alert-dispatcher', p_success: true, p_error: null }); } catch (_) { /* */ }

  return { success: true, request_id: requestId, timestamp: now.toISOString(), metrics, alerts, alerts_created: alerts.length };
}

// ─── integrity-sentinel ─────────────────────────────────────────────────────

export async function handleIntegritySentinel(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const startTime = Date.now();
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') return { __status: 503, success: false, error: 'SYSTEM_HALTED' };

  const { data: violations, error: violationsError } = await supabase.rpc('detect_silent_job_failures');
  if (!violationsError && violations?.length) {
    const violationsByTenant = new Map<string, typeof violations>();
    for (const v of violations) {
      const existing = violationsByTenant.get(v.tenant_id) || [];
      existing.push(v);
      violationsByTenant.set(v.tenant_id, existing);
    }
    for (const [tenantId, tenantViolations] of violationsByTenant) {
      const { data: existingAlerts } = await supabase.from('system_alerts').select('id').eq('tenant_id', tenantId).eq('alert_type', 'job_integrity_violation').eq('resolved', false).gte('created_at', new Date(Date.now() - 3600000).toISOString()).limit(1);
      if (existingAlerts?.length) continue;
      await supabase.from('system_alerts').insert({ tenant_id: tenantId, alert_type: 'job_integrity_violation', severity: 'critical', message: `${tenantViolations.length} jobs marked completed without real side effects`, data: { violations: tenantViolations.slice(0, 20), detected_at: new Date().toISOString(), sentinel_run: true }, resolved: false });
    }
  }

  const { data: releaseIntegrity, error: releaseError } = await supabase.rpc('validate_agent_release_integrity');
  if (!releaseError && releaseIntegrity) {
    const invalidReleases = releaseIntegrity.filter((r: { is_valid: boolean }) => !r.is_valid);
    if (invalidReleases.length > 0) {
      await supabase.from('system_alerts').insert({ tenant_id: null, alert_type: 'agent_release_integrity_warning', severity: 'high', message: `${invalidReleases.length} agent releases with integrity issues`, data: { invalid_releases: invalidReleases }, resolved: false });
    }
  }

  const { data: emptyOutputJobs } = await supabase.from('jobs').select('id, type, agent_name, created_at').eq('status', 'completed').is('output', null).in('type', ['collect_web_activity', 'collect_system_metrics', 'software_inventory_collect']).gte('created_at', new Date(Date.now() - 86400000).toISOString()).limit(100);

  const duration = Date.now() - startTime;
  const resultData = { violations_found: violations?.length || 0, release_issues: releaseIntegrity?.filter((r: { is_valid: boolean }) => !r.is_valid).length || 0, empty_output_jobs: emptyOutputJobs?.length || 0 };
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'integrity-sentinel', p_success: true, p_duration_ms: duration, p_result: resultData, p_processed_count: (violations?.length || 0) + (emptyOutputJobs?.length || 0), p_job_source: 'cron' });
  await supabase.rpc('update_cron_health', { p_cron_name: 'integrity-sentinel-15min', p_success: true, p_error: null });

  return { success: true, timestamp: new Date().toISOString(), duration_ms: duration, ...resultData };
}

// ─── populate-security-graph ────────────────────────────────────────────────

export async function handlePopulateSecurityGraph(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const tenant_id = payload.tenant_id as string;
  if (!tenant_id) return { __status: 400, error: 'tenant_id required' };

  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<Record<string, unknown>> = [];
  const nodeMap = new Map<string, string>();

  function addNode(type: string, value: string, label: string, risk: number, meta: Record<string, unknown> = {}) {
    const key = `${type}:${value}`;
    if (nodeMap.has(key)) return nodeMap.get(key)!;
    const id = crypto.randomUUID();
    nodeMap.set(key, id);
    nodes.push({ id, tenant_id, node_type: type, node_value: value, label: label || value, risk_score: Math.min(risk, 100), metadata: meta, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
    return id;
  }
  function addEdge(sourceId: string, targetId: string, rel: string, conf = 0.8) {
    edges.push({ id: crypto.randomUUID(), tenant_id, source_node_id: sourceId, target_node_id: targetId, relationship: rel, confidence: conf, metadata: {} });
  }

  const { data: agents } = await supabase.from('agents').select('id, hostname, agent_state, os_type, agent_version, is_isolated').eq('tenant_id', tenant_id);
  const agentNodeIds: Record<string, string> = {};
  for (const a of agents || []) {
    const risk = a.is_isolated ? 90 : a.agent_state === 'offline' ? 40 : a.agent_state === 'degraded' ? 60 : 10;
    agentNodeIds[a.id] = addNode('agent', a.id, a.hostname || a.id.slice(0, 8), risk, { os: a.os_type, version: a.agent_version, state: a.agent_state });
  }

  const { data: threats } = await supabase.from('threat_indicators').select('id, indicator_type, indicator_value, severity, source, confidence_score').eq('tenant_id', tenant_id).eq('is_active', true).limit(300);
  for (const t of threats || []) {
    const typeMap: Record<string, string> = { file_hash_sha256: 'hash', url: 'domain', ip_address: 'ip', domain: 'domain', c2_ip: 'ip', file_hash_md5: 'hash' };
    const risk = t.severity === 'critical' ? 95 : t.severity === 'high' ? 80 : t.severity === 'medium' ? 50 : 30;
    addNode(typeMap[t.indicator_type] || 'hash', t.indicator_value, t.indicator_value.slice(0, 20), risk, { severity: t.severity, source: t.source });
  }

  const { data: evidenceLogs } = await supabase.from('agent_evidence_logs').select('agent_id, agent_name, event_type, event_data, severity').eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(500);
  for (const ev of evidenceLogs || []) {
    if (!ev.agent_id || !agentNodeIds[ev.agent_id]) continue;
    const agentNid = agentNodeIds[ev.agent_id];
    const data = ev.event_data as Record<string, unknown>;
    if (!data) continue;
    const jsonStr = JSON.stringify(data);
    const ipMatch = jsonStr.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g);
    if (ipMatch) for (const ip of [...new Set(ipMatch)].slice(0, 5)) { if (ip === '127.0.0.1' || ip === '0.0.0.0') continue; addEdge(agentNid, addNode('ip', ip, ip, ev.severity === 'critical' ? 85 : 30, { from_event: ev.event_type }), `evidence:${ev.event_type}`, 0.7); }
    const hashMatch = jsonStr.match(/\b[a-f0-9]{64}\b/gi);
    if (hashMatch) for (const hash of [...new Set(hashMatch)].slice(0, 3)) addEdge(agentNid, addNode('hash', hash, hash.slice(0, 16) + '…', 60, {}), 'detected_hash', 0.9);
    if (data.process_name || data.processName) { const pName = (data.process_name || data.processName) as string; addEdge(agentNid, addNode('process', `${ev.agent_id}:${pName}`, pName, ev.severity === 'critical' ? 80 : 40, {}), 'ran_process', 0.9); }
  }

  const { data: matches } = await supabase.from('threat_matches').select('agent_id, indicator_id, match_type, detected_value').eq('tenant_id', tenant_id).limit(200);
  for (const m of matches || []) { if (m.agent_id && agentNodeIds[m.agent_id] && nodeMap.has(`hash:${m.detected_value}`)) addEdge(agentNodeIds[m.agent_id], nodeMap.get(`hash:${m.detected_value}`)!, 'threat_match', 0.95); }

  const { data: blocked } = await supabase.from('blocked_access_attempts').select('agent_id, blocked_target, block_type, severity').eq('tenant_id', tenant_id).limit(200);
  for (const b of blocked || []) { if (b.agent_id && agentNodeIds[b.agent_id]) addEdge(agentNodeIds[b.agent_id], addNode(b.block_type === 'domain' ? 'domain' : 'ip', b.blocked_target, b.blocked_target, b.severity === 'critical' ? 90 : 45, {}), 'blocked_access', 0.85); }

  const { data: vulns } = await supabase.from('vuln_findings').select('agent_id, cve_id, severity, affected_software').eq('tenant_id', tenant_id).limit(200);
  for (const v of vulns || []) { if (v.agent_id && agentNodeIds[v.agent_id] && v.cve_id) addEdge(agentNodeIds[v.agent_id], addNode('cve', v.cve_id, v.cve_id, v.severity === 'critical' ? 95 : 40, { software: v.affected_software }), 'vulnerable_to', 0.9); }

  await supabase.from('security_graph_edges').delete().eq('tenant_id', tenant_id);
  await supabase.from('security_graph_nodes').delete().eq('tenant_id', tenant_id);
  for (let i = 0; i < nodes.length; i += 100) await supabase.from('security_graph_nodes').insert(nodes.slice(i, i + 100));
  for (let i = 0; i < edges.length; i += 100) await supabase.from('security_graph_edges').insert(edges.slice(i, i + 100));

  return { success: true, nodes_created: nodes.length, edges_created: edges.length, breakdown: { agents: (agents || []).length, threats: (threats || []).length, evidence_processed: (evidenceLogs || []).length } };
}

// ─── publish-threat-ioc ─────────────────────────────────────────────────────

export async function handlePublishThreatIoc(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const { iocs, detection_type, source_agent_name } = payload as {
    iocs: Array<{ type: string; value: string; severity: string; tags?: string[]; context?: string; source_agent_id?: string; source_tenant_id?: string; metadata?: Record<string, unknown> }>;
    detection_type: string; source_agent_name?: string;
  };
  if (!iocs?.length || !detection_type) return { __status: 400, error: 'iocs and detection_type required' };

  let reputationUpserted = 0, indicatorsPublished = 0;

  for (const ioc of iocs) {
    if (!ioc.value || ioc.value.length < 3 || ioc.value.length > 2048) continue;
    const { error: repError } = await supabase.from('threat_network_reputation').upsert({
      indicator_type: ioc.type, indicator_value: ioc.value.toLowerCase().trim(), severity: ioc.severity,
      confidence_score: Math.min(100, 50 + (ioc.severity === 'critical' ? 30 : ioc.severity === 'high' ? 20 : 10)),
      last_reported_at: new Date().toISOString(),
      source_context: { detection_type, tags: ioc.tags || [], last_source_agent: source_agent_name || 'unknown', ...(ioc.metadata || {}) },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'indicator_type,indicator_value' });
    if (!repError) reputationUpserted++;
    if (ioc.source_tenant_id) await supabase.rpc('increment_threat_reputation_count', { p_indicator_type: ioc.type, p_indicator_value: ioc.value.toLowerCase().trim(), p_tenant_id: ioc.source_tenant_id }).catch(() => {});
  }

  const { data: tenants } = await supabase.from('tenants').select('id').eq('is_active', true);
  if (tenants?.length) {
    const indicatorRows: Array<Record<string, unknown>> = [];
    for (const tenant of tenants) {
      for (const ioc of iocs) {
        if (!ioc.value || ioc.value.length < 3) continue;
        indicatorRows.push({
          tenant_id: tenant.id, indicator_type: ioc.type, indicator_value: ioc.value.toLowerCase().trim(),
          severity: ioc.severity, source: 'cybershield_network', source_reference: `csn:${detection_type}:${requestId}`,
          tags: [...(ioc.tags || []), 'cybershield_network', detection_type],
          confidence_score: Math.min(100, 50 + (ioc.severity === 'critical' ? 30 : 20)),
          last_seen_at: new Date().toISOString(), is_active: true,
          metadata: { network_source: true, detection_type, source_agent: source_agent_name, ...(ioc.metadata || {}) },
        });
      }
    }
    for (let i = 0; i < indicatorRows.length; i += 200) {
      const batch = indicatorRows.slice(i, i + 200);
      const { error: upsertError } = await supabase.from('threat_indicators').upsert(batch, { onConflict: 'tenant_id,indicator_type,indicator_value,source', ignoreDuplicates: false });
      if (!upsertError) indicatorsPublished += batch.length;
    }
  }

  return { success: true, request_id: requestId, iocs_received: iocs.length, reputation_upserted: reputationUpserted, indicators_published: indicatorsPublished, tenants_notified: tenants?.length || 0 };
}
