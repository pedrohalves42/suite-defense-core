/**
 * Cleanup namespace inlined handlers (migrated from cleanup-router)
 * 
 * Includes: telemetry, stale-reports, stale-updates, stale-playbooks,
 * offline-agents-jobs, stuck-builds, stuck-jobs, auto-cleanup-jobs,
 * security, jobs, expired-enrollment-keys, orphaned-data, stale-honeypots,
 * old-process-snapshots
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

type SB = ReturnType<typeof createClient>;

// ── telemetry ───────────────────────────────────────────────────────────
export async function handleCleanupTelemetry(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_expired_telemetry');
  if (cleanupError) logger.error(`[${requestId}] [cleanup:telemetry] Cleanup error:`, cleanupError.message);

  const { data: tenants } = await supabase.from('telemetry_retention_config').select('tenant_id').eq('is_enabled', true);
  const uniqueTenants = [...new Set((tenants || []).map((t: { tenant_id: string }) => t.tenant_id))];

  const CONCURRENCY = 5;
  const summaryResults: { tenant_id: string; result: unknown }[] = [];
  for (let i = 0; i < uniqueTenants.length; i += CONCURRENCY) {
    const batch = uniqueTenants.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (tenantId: string) => {
        const { data: summaryResult, error: summaryError } = await supabase.rpc('summarize_telemetry_hourly', { p_tenant_id: tenantId, p_hours_ago: 2 });
        if (summaryError) logger.error(`[${requestId}] [cleanup:telemetry] Summary error for ${tenantId}:`, summaryError.message);
        return { tenant_id: tenantId, result: summaryResult };
      })
    );
    summaryResults.push(...batchResults);
  }
  return { success: true, cleanup: cleanupResult, summaries: summaryResults, tenants_processed: uniqueTenants.length };
}

// ── stale-reports ───────────────────────────────────────────────────────
export async function handleCleanupStaleReports(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const STALE_HOURS = 24;
  const results = { processed: 0, cleaned: 0, retried: 0, failed: 0, errors: [] as string[] };
  const cutoffTime = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleReports, error: fetchError } = await supabase.from('security_reports').select('id, tenant_id, report_type, status, created_at').in('status', ['pending', 'processing', 'generated']).lt('created_at', cutoffTime);
  if (fetchError) throw new Error(`Failed to fetch stale reports: ${fetchError.message}`);
  if (!staleReports || staleReports.length === 0) return { success: true, ...results };

  for (const report of staleReports) {
    results.processed++;
    try {
      const ageHours = Math.floor((Date.now() - new Date(report.created_at).getTime()) / (1000 * 60 * 60));
      if (ageHours > 48) {
        const { error } = await supabase.from('security_reports').update({ status: 'failed', error_message: `Relatorio expirado apos ${ageHours} horas sem conclusao`, updated_at: new Date().toISOString() }).eq('id', report.id);
        if (error) results.errors.push(`Failed to update report ${report.id}: ${error.message}`);
        else { results.failed++; results.cleaned++; }
      } else if (report.status === 'generated') {
        const { error } = await supabase.from('security_reports').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', report.id);
        if (error) results.errors.push(`Failed to complete report ${report.id}: ${error.message}`);
        else { results.retried++; results.cleaned++; }
      } else {
        const { error } = await supabase.from('security_reports').update({ status: 'failed', error_message: `Relatorio travado em status "${report.status}" por ${ageHours} horas`, updated_at: new Date().toISOString() }).eq('id', report.id);
        if (!error) results.cleaned++;
      }
    } catch (err) { results.errors.push(`Error processing report ${report.id}: ${err instanceof Error ? err.message : 'Unknown error'}`); }
  }
  return { success: true, ...results };
}

// ── stale-updates ───────────────────────────────────────────────────────
export async function handleCleanupStaleUpdates(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const MAX_DELIVERY_COUNT = 10;
  const MAX_STALE_HOURS = 168;
  const staleThreshold = new Date(Date.now() - MAX_STALE_HOURS * 60 * 60 * 1000).toISOString();

  const [{ data: staleByTime, error: err1 }, { data: staleByCount, error: err2 }] = await Promise.all([
    supabase.from('agents').select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id').not('force_update_version', 'is', null).lt('force_update_at', staleThreshold),
    supabase.from('agents').select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id').not('force_update_version', 'is', null).gte('force_update_delivery_count', MAX_DELIVERY_COUNT),
  ]);
  if (err1 || err2) logger.error(`[${requestId}] [cleanup:stale-updates] Query errors:`, err1, err2);

  const allStale = new Map<string, Record<string, unknown>>();
  for (const agent of [...(staleByTime || []), ...(staleByCount || [])]) allStale.set(agent.id, agent);
  const staleAgents = Array.from(allStale.values()).filter(agent => {
    if (agent.force_update_reason === 'auto_retrigger_72h_offline' && (agent.force_update_delivery_count as number || 0) === 0) return false;
    return true;
  });
  if (staleAgents.length === 0) return { message: 'No stale updates found', cleaned: 0 };

  let cleaned = 0;
  for (const agent of staleAgents) {
    const { error } = await supabase.from('agents').update({ force_update_version: null, force_update_reason: null, force_update_at: null, force_update_delivery_count: 0 }).eq('id', agent.id);
    if (error) { logger.error(`[${requestId}] Failed to clean ${agent.agent_name}:`, error); continue; }
    await supabase.from('agent_evidence_logs').insert({ agent_id: agent.id, agent_name: agent.agent_name, agent_version: agent.agent_version, tenant_id: agent.tenant_id, event_type: 'force_update_auto_cancelled', event_data: { cancelled_version: agent.force_update_version, delivery_count: agent.force_update_delivery_count || 0, cleaned_at: new Date().toISOString() }, evidence_hash: crypto.randomUUID(), severity: 'warn' });
    cleaned++;
  }
  return { success: true, cleaned, total_stale: staleAgents.length };
}

// ── stale-playbooks ─────────────────────────────────────────────────────
export async function handleCleanupStalePlaybooks(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const TIMEOUT_MINUTES = 30;
  const results = { processed: 0, cleaned: 0, alertsCreated: 0, errors: [] as string[] };
  const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: staleExecutions, error: fetchError } = await supabase.from('playbook_executions').select('id, playbook_id, tenant_id, started_at, status').in('status', ['pending', 'in_progress']).lt('started_at', cutoffTime);
  if (fetchError) throw new Error(`Failed to fetch stale executions: ${fetchError.message}`);
  if (!staleExecutions || staleExecutions.length === 0) return { success: true, cleaned: 0 };

  for (const execution of staleExecutions) {
    results.processed++;
    try {
      const { error } = await supabase.from('playbook_executions').update({ status: 'failed', completed_at: new Date().toISOString(), notes: `Timeout automatico: execucao excedeu ${TIMEOUT_MINUTES} minutos sem conclusao` }).eq('id', execution.id);
      if (error) { results.errors.push(`Failed: ${execution.id}: ${error.message}`); continue; }
      results.cleaned++;
      const { error: alertErr } = await supabase.from('system_alerts').insert({ tenant_id: execution.tenant_id, alert_type: 'playbook_timeout', severity: 'high', message: `Execucao de playbook travada por mais de ${TIMEOUT_MINUTES} minutos`, metadata: { execution_id: execution.id, playbook_id: execution.playbook_id }, resolved: false });
      if (!alertErr) results.alertsCreated++;
    } catch (err) { results.errors.push(`Error: ${execution.id}: ${err instanceof Error ? err.message : 'Unknown'}`); }
  }
  return { success: true, ...results };
}

// ── offline-agents-jobs ─────────────────────────────────────────────────
export async function handleCleanupOfflineAgentsJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('cleanup_offline_agents_jobs');
  if (error) throw new Error(error.message);
  const result = data?.[0] || { cleaned_count: 0, agent_ids: [], job_ids: [] };
  return { success: true, cleaned_count: result.cleaned_count, agent_ids: result.agent_ids || [], job_ids: result.job_ids || [] };
}

// ── stuck-builds ────────────────────────────────────────────────────────
export async function handleCleanupStuckBuilds(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('cleanup_stuck_builds');
  if (error) throw new Error(`Cleanup function failed: ${error.message}`);
  const result = Array.isArray(data) && data.length > 0 ? data[0] : { cleaned_count: 0, build_ids: [] };
  return { success: true, cleaned_count: result.cleaned_count || 0, build_ids: result.build_ids || [] };
}

// ── stuck-jobs ──────────────────────────────────────────────────────────
export async function handleCleanupStuckJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const MAX_DELIVERY_ATTEMPTS = 5;
  const STUCK_TIMEOUT_MINUTES = 10;
  const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: stuckDelivered, error: stuckError } = await supabase.from('jobs').select('id, agent_name, type, delivered_at, delivery_attempts, expires_at').eq('status', 'delivered').lt('delivered_at', cutoffTime);
  if (stuckError) logger.error(`[${requestId}] [cleanup:stuck-jobs] Error:`, stuckError);

  let failedDeliveredCount = 0;
  if (stuckDelivered && stuckDelivered.length > 0) {
    const allIds = stuckDelivered.map(j => j.id);
    const { error: failError } = await supabase.from('jobs').update({ status: 'failed', completed_at: now, error_message: '[CLEANUP] Job delivered but agent never submitted result', failure_class: 'AGENT_STALLED' }).in('id', allIds);
    if (!failError) failedDeliveredCount = allIds.length;

    const retryable = stuckDelivered.filter(j => (j.delivery_attempts || 0) < MAX_DELIVERY_ATTEMPTS - 1 && !(j.expires_at && new Date(j.expires_at) < new Date(now)));
    if (retryable.length > 0) {
      const { data: fullJobs } = await supabase.from('jobs').select('id, tenant_id, agent_id, agent_name, type, payload, priority, is_recurring').in('id', retryable.map(j => j.id));
      const retryRows = (fullJobs || []).filter(fj => fj.is_recurring && fj.agent_id).map(fj => ({
        type: fj.type, agent_id: fj.agent_id, agent_name: fj.agent_name, tenant_id: fj.tenant_id, status: 'queued', approved: true, priority: fj.priority,
        payload: { ...(fj.payload as Record<string, unknown>), retry_of: fj.id, retry_count: ((fj.payload as Record<string, unknown>)?.retry_count as number || 0) + 1 },
        is_recurring: true, parent_job_id: fj.id, expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      }));
      if (retryRows.length > 0) await supabase.from('jobs').insert(retryRows);
    }
  }

  let zombieCleaned = { total: 0 };
  try { const { data } = await supabase.rpc('cleanup_zombie_executions'); if (data) zombieCleaned = data as { total: number }; } catch (e) { logger.warn('[cleanup] zombie cleanup RPC failed', e instanceof Error ? e.message : e); }

  const { data: expiredJobs } = await supabase.from('jobs').select('id').in('status', ['queued', 'delivered', 'pending']).lt('expires_at', now);
  let expiredCount = 0;
  if (expiredJobs && expiredJobs.length > 0) {
    const { error } = await supabase.from('jobs').update({ status: 'failed', error_message: '[DLQ:EXPIRED_TTL] Job expired', completed_at: now, failure_class: 'EXPIRED' }).in('id', expiredJobs.map(j => j.id));
    if (!error) expiredCount = expiredJobs.length;
  }

  return { success: true, stuck_delivered_failed: failedDeliveredCount, zombie_executions_cleaned: zombieCleaned.total, expired_failed: expiredCount, total_cleaned: failedDeliveredCount + expiredCount + zombieCleaned.total };
}

// ── auto-cleanup-jobs ───────────────────────────────────────────────────
export async function handleAutoCleanupJobs(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') return { success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' };

  const queuedThresholdHours = (payload.queued_threshold_hours as number) ?? 2;
  const deliveredThresholdHours = (payload.delivered_threshold_hours as number) ?? 0.5;
  const targetTenantId = (payload.tenant_id as string) ?? null;
  const enableRetry = (payload.enable_retry as boolean) ?? true;

  const queuedCutoff = new Date(Date.now() - queuedThresholdHours * 60 * 60 * 1000).toISOString();
  const deliveredCutoff = new Date(Date.now() - deliveredThresholdHours * 60 * 60 * 1000).toISOString();

  let queuedQuery = supabase.from('jobs').update({ status: 'cancelled', error_message: `Auto-cancelled: ${queuedThresholdHours}h`, completed_at: new Date().toISOString() }).eq('status', 'queued').lt('created_at', queuedCutoff);
  if (targetTenantId) queuedQuery = queuedQuery.eq('tenant_id', targetTenantId);
  const { data: cancelledJobs, error: cancelError } = await queuedQuery.select('id, tenant_id');
  if (cancelError) throw cancelError;

  let deliveredQuery = supabase.from('jobs').update({ status: 'failed', error_message: `Timeout: ${deliveredThresholdHours}h`, completed_at: new Date().toISOString() }).eq('status', 'delivered').lt('delivered_at', deliveredCutoff);
  if (targetTenantId) deliveredQuery = deliveredQuery.eq('tenant_id', targetTenantId);
  const { data: failedJobs, error: failError } = await deliveredQuery.select('id, tenant_id');
  if (failError) throw failError;

  const queuedCancelled = cancelledJobs?.length ?? 0;
  const deliveredFailed = failedJobs?.length ?? 0;
  let retriedCount = 0;
  if (enableRetry && failedJobs && failedJobs.length > 0) {
    const { data: fullJobs } = await supabase.from('jobs').select('id, type, agent_id, agent_name, tenant_id, payload, is_recurring').in('id', failedJobs.map(j => j.id));
    const retryRows = (fullJobs || []).filter(fj => fj.is_recurring && fj.agent_id).map(fj => ({
      type: fj.type, agent_id: fj.agent_id, agent_name: fj.agent_name, tenant_id: fj.tenant_id, status: 'queued', approved: true,
      payload: { ...(fj.payload as Record<string, unknown>), retry_of: fj.id, retry_count: ((fj.payload as Record<string, unknown>)?.retry_count as number || 0) + 1 },
      is_recurring: true, parent_job_id: fj.id,
    }));
    if (retryRows.length > 0) { const { error } = await supabase.from('jobs').insert(retryRows); if (!error) retriedCount = retryRows.length; }
  }

  return { success: true, queued_cancelled: queuedCancelled, delivered_failed: deliveredFailed, total_cleaned: queuedCancelled + deliveredFailed, retried: retriedCount };
}

// ── security ────────────────────────────────────────────────────────────
export async function handleSecurityCleanup(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const now = new Date();
  const stats = { hmac_signatures_deleted: 0, rate_limits_deleted: 0, failed_logins_deleted: 0, ip_blocklist_deleted: 0, old_metrics_deleted: 0, security_logs_archived: 0 };

  const hmacCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { data: hmacDeleted } = await supabase.from('hmac_signatures').delete().lt('used_at', hmacCutoff.toISOString()).select('id');
  stats.hmac_signatures_deleted = hmacDeleted?.length || 0;

  const rlCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const { data: rlDeleted } = await supabase.from('rate_limits').delete().lt('window_start', rlCutoff.toISOString()).select('id');
  stats.rate_limits_deleted = rlDeleted?.length || 0;

  const loginCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: loginDeleted } = await supabase.from('failed_login_attempts').delete().lt('attempted_at', loginCutoff.toISOString()).select('id');
  stats.failed_logins_deleted = loginDeleted?.length || 0;

  const blockCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { data: blockDeleted } = await supabase.from('ip_blocklist').delete().lt('blocked_until', blockCutoff.toISOString()).select('id');
  stats.ip_blocklist_deleted = blockDeleted?.length || 0;

  return { success: true, ...stats };
}

// ── jobs (admin action) ─────────────────────────────────────────────────
export async function handleCleanupJobs(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { success: false, error: 'tenant_id required' };

  const daysOld = (payload.days_old as number) || 30;
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  const { data: deleted, error } = await supabase.from('jobs').delete().eq('tenant_id', tenantId).in('status', ['completed', 'cancelled', 'failed']).lt('created_at', cutoff).select('id');
  if (error) throw error;

  return { success: true, deleted_count: deleted?.length || 0, days_old: daysOld };
}

// ── expired-enrollment-keys (from standalone) ───────────────────────────
export async function handleCleanupExpiredEnrollmentKeys(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const { data, error } = await supabase.from('enrollment_keys').delete().lt('expires_at', fortyEightHoursAgo.toISOString()).eq('is_active', false).select('id');
  if (error) throw error;
  return { success: true, deleted_count: data?.length || 0, message: `Limpeza concluida: ${data?.length || 0} chaves expiradas removidas` };
}

// ── orphaned-data (from standalone) ─────────────────────────────────────
export async function handleCleanupOrphanedData(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const results = { orphaned_jobs_deleted: 0, testev10_agent_deleted: false, testev10_tokens_deleted: 0, testev10_jobs_deleted: 0, testev10_metrics_deleted: 0, errors: [] as string[] };

  const { data: orphanedJobs, error: orphanedError } = await supabase.from('jobs').delete().is('agent_id', null).select('id');
  if (orphanedError) results.errors.push(`Orphaned jobs: ${orphanedError.message}`);
  else results.orphaned_jobs_deleted = orphanedJobs?.length || 0;

  const { data: testAgent, error: agentError } = await supabase.from('agents').select('id, tenant_id').eq('agent_name', 'testev10').single();
  if (!agentError && testAgent) {
    const { data: dTokens } = await supabase.from('agent_tokens').delete().eq('agent_id', testAgent.id).select('id');
    results.testev10_tokens_deleted = dTokens?.length || 0;
    const { data: dJobs } = await supabase.from('jobs').delete().eq('agent_id', testAgent.id).select('id');
    results.testev10_jobs_deleted = dJobs?.length || 0;
    const { error: deleteErr } = await supabase.from('agents').delete().eq('id', testAgent.id);
    results.testev10_agent_deleted = !deleteErr;
    if (deleteErr) results.errors.push(`testev10 agent: ${deleteErr.message}`);
  }

  return { success: results.errors.length === 0, results };
}

// ── stale-honeypots (from standalone) ───────────────────────────────────
export async function handleCleanupStaleHoneypots(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const results = { stale_honeypots_deactivated: 0, rate_data_cleaned: 0, old_interactions_cleaned: 0 };
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleAgents } = await supabase.from('agents').select('id').eq('honeypot_mode', 'native').or(`last_honeypot_interaction_at.is.null,last_honeypot_interaction_at.lt.${thirtyDaysAgo}`).lt('honeypot_activated_at', thirtyDaysAgo);
  if (staleAgents && staleAgents.length > 0) {
    const ids = staleAgents.map((a: { id: string }) => a.id);
    const { count } = await supabase.from('agents').update({ honeypot_mode: 'none', status: 'inactive', last_honeypot_state_change_at: new Date().toISOString() }).in('id', ids);
    results.stale_honeypots_deactivated = count || staleAgents.length;
  }

  const { data: cleanedRL } = await supabase.rpc('cleanup_honeypot_rate_data', { p_older_than_minutes: 10 });
  results.rate_data_cleaned = cleanedRL || 0;

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: deletedInteractions } = await supabase.from('honeypot_interactions').delete().lt('created_at', cutoff);
  results.old_interactions_cleaned = deletedInteractions || 0;

  return { success: true, request_id: requestId, ...results };
}
