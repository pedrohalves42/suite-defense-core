/**
 * Cleanup Router Handlers
 * 
 * Consolidated handler functions for all cleanup operations.
 * Each handler receives a Supabase client and returns a result object.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

// ------------------------------------------------
// Handler: telemetry
// ------------------------------------------------
export async function handleCleanupTelemetry(supabase: SupabaseClient, requestId: string) {
  const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_expired_telemetry');
  if (cleanupError) {
    logger.error(`[${requestId}] [cleanup:telemetry] Cleanup error:`, cleanupError.message);
  }

  const { data: tenants } = await supabase
    .from('telemetry_retention_config')
    .select('tenant_id')
    .eq('is_enabled', true);

  const uniqueTenants = [...new Set((tenants || []).map((t: { tenant_id: string }) => t.tenant_id))];

  const CONCURRENCY = 5;
  const summaryResults: { tenant_id: string; result: unknown }[] = [];

  for (let i = 0; i < uniqueTenants.length; i += CONCURRENCY) {
    const batch = uniqueTenants.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (tenantId: string) => {
        const { data: summaryResult, error: summaryError } = await supabase.rpc('summarize_telemetry_hourly', {
          p_tenant_id: tenantId,
          p_hours_ago: 2,
        });
        if (summaryError) {
          logger.error(`[${requestId}] [cleanup:telemetry] Summary error for ${tenantId}:`, summaryError.message);
        }
        return { tenant_id: tenantId, result: summaryResult };
      })
    );
    summaryResults.push(...batchResults);
  }

  return {
    success: true,
    cleanup: cleanupResult,
    summaries: summaryResults,
    tenants_processed: uniqueTenants.length,
  };
}

// ──────────────────────────────────────────────
// Handler: stale-reports
// ──────────────────────────────────────────────
export async function handleCleanupStaleReports(supabase: SupabaseClient, requestId: string) {
  const STALE_HOURS = 24;
  const results = { processed: 0, cleaned: 0, retried: 0, failed: 0, errors: [] as string[] };

  const cutoffTime = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleReports, error: fetchError } = await supabase
    .from('security_reports')
    .select('id, tenant_id, report_type, status, created_at')
    .in('status', ['pending', 'processing', 'generated'])
    .lt('created_at', cutoffTime);

  if (fetchError) throw new Error(`Failed to fetch stale reports: ${fetchError.message}`);

  if (!staleReports || staleReports.length === 0) {
    return { success: true, ...results };
  }

  logger.info(`[${requestId}] [cleanup:stale-reports] Found ${staleReports.length} stale reports`);

  for (const report of staleReports) {
    results.processed++;
    try {
      const ageHours = Math.floor((Date.now() - new Date(report.created_at).getTime()) / (1000 * 60 * 60));

      if (ageHours > 48) {
        const { error: updateError } = await supabase
          .from('security_reports')
          .update({ status: 'failed', error_message: `Relatorio expirado apos ${ageHours} horas sem conclusao`, updated_at: new Date().toISOString() })
          .eq('id', report.id);
        if (updateError) results.errors.push(`Failed to update report ${report.id}: ${updateError.message}`);
        else { results.failed++; results.cleaned++; }
      } else if (report.status === 'generated') {
        const { error: completeError } = await supabase
          .from('security_reports')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', report.id);
        if (completeError) results.errors.push(`Failed to complete report ${report.id}: ${completeError.message}`);
        else { results.retried++; results.cleaned++; }
      } else {
        const { error: failError } = await supabase
          .from('security_reports')
          .update({ status: 'failed', error_message: `Relatorio travado em status "${report.status}" por ${ageHours} horas`, updated_at: new Date().toISOString() })
          .eq('id', report.id);
        if (!failError) results.cleaned++;
      }
    } catch (err) {
      results.errors.push(`Error processing report ${report.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { success: true, ...results };
}

// ──────────────────────────────────────────────
// Handler: stale-updates
// ──────────────────────────────────────────────
export async function handleCleanupStaleUpdates(supabase: SupabaseClient, requestId: string) {
  const MAX_DELIVERY_COUNT = 10;
  const MAX_STALE_HOURS = 168;
  const staleThreshold = new Date(Date.now() - MAX_STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleByTime, error: err1 } = await supabase
    .from('agents')
    .select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id')
    .not('force_update_version', 'is', null)
    .lt('force_update_at', staleThreshold);

  const { data: staleByCount, error: err2 } = await supabase
    .from('agents')
    .select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id')
    .not('force_update_version', 'is', null)
    .gte('force_update_delivery_count', MAX_DELIVERY_COUNT);

  if (err1 || err2) logger.error(`[${requestId}] [cleanup:stale-updates] Query errors:`, err1, err2);

  const allStale = new Map<string, Record<string, unknown>>();
  for (const agent of [...(staleByTime || []), ...(staleByCount || [])]) {
    allStale.set(agent.id, agent);
  }

  const staleAgents = Array.from(allStale.values()).filter(agent => {
    if (agent.force_update_reason === 'auto_retrigger_72h_offline' && (agent.force_update_delivery_count as number || 0) === 0) {
      return false;
    }
    return true;
  });

  if (staleAgents.length === 0) {
    return { message: 'No stale updates found', cleaned: 0 };
  }

  let cleaned = 0;
  for (const agent of staleAgents) {
    const reason = ((agent.force_update_delivery_count as number) || 0) >= MAX_DELIVERY_COUNT
      ? `Loop detected: ${agent.force_update_delivery_count} deliveries without confirmation`
      : `Stale: force_update_at ${agent.force_update_at} exceeds ${MAX_STALE_HOURS}h threshold`;

    const { error: updateErr } = await supabase
      .from('agents')
      .update({ force_update_version: null, force_update_reason: null, force_update_at: null, force_update_delivery_count: 0 })
      .eq('id', agent.id);

    if (updateErr) { logger.error(`[${requestId}] Failed to clean ${agent.agent_name}:`, updateErr); continue; }

    await supabase.from('agent_evidence_logs').insert({
      agent_id: agent.id,
      agent_name: agent.agent_name,
      agent_version: agent.agent_version,
      tenant_id: agent.tenant_id,
      event_type: 'force_update_auto_cancelled',
      event_data: { cancelled_version: agent.force_update_version, reason, original_trigger: agent.force_update_reason, delivery_count: agent.force_update_delivery_count || 0, force_update_at: agent.force_update_at, cleaned_at: new Date().toISOString() },
      evidence_hash: crypto.randomUUID(),
      severity: 'warn',
    });

    cleaned++;
  }

  return { success: true, cleaned, total_stale: staleAgents.length, agents: staleAgents.map(a => ({ name: a.agent_name, stuck_version: a.force_update_version, delivery_count: a.force_update_delivery_count, trigger_reason: a.force_update_reason })) };
}

// ──────────────────────────────────────────────
// Handler: stale-playbooks
// ──────────────────────────────────────────────
export async function handleCleanupStalePlaybooks(supabase: SupabaseClient, requestId: string) {
  const TIMEOUT_MINUTES = 30;
  const results = { processed: 0, cleaned: 0, alertsCreated: 0, errors: [] as string[] };

  const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: staleExecutions, error: fetchError } = await supabase
    .from('playbook_executions')
    .select('id, playbook_id, tenant_id, started_at, status')
    .in('status', ['pending', 'in_progress'])
    .lt('started_at', cutoffTime);

  if (fetchError) throw new Error(`Failed to fetch stale executions: ${fetchError.message}`);

  if (!staleExecutions || staleExecutions.length === 0) {
    return { success: true, cleaned: 0 };
  }

  for (const execution of staleExecutions) {
    results.processed++;
    try {
      const { error: updateError } = await supabase
        .from('playbook_executions')
        .update({ status: 'failed', completed_at: new Date().toISOString(), notes: `Timeout automatico: execucao excedeu ${TIMEOUT_MINUTES} minutos sem conclusao` })
        .eq('id', execution.id);
      if (updateError) { results.errors.push(`Failed to update execution ${execution.id}: ${updateError.message}`); continue; }
      results.cleaned++;

      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({ tenant_id: execution.tenant_id, alert_type: 'playbook_timeout', severity: 'high', message: `Execucao de playbook travada por mais de ${TIMEOUT_MINUTES} minutos foi automaticamente marcada como falha`, metadata: { execution_id: execution.id, playbook_id: execution.playbook_id, started_at: execution.started_at, original_status: execution.status }, resolved: false });
      if (!alertError) results.alertsCreated++;
    } catch (err) {
      results.errors.push(`Error processing execution ${execution.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { success: true, ...results };
}

// ──────────────────────────────────────────────
// Handler: offline-agents-jobs
// ──────────────────────────────────────────────
export async function handleCleanupOfflineAgentsJobs(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.rpc('cleanup_offline_agents_jobs');
  if (error) {
    logger.error(`[${requestId}] [cleanup:offline-agents-jobs] Error:`, error);
    throw new Error(error.message);
  }
  const result = data?.[0] || { cleaned_count: 0, agent_ids: [], job_ids: [] };
  return { success: true, cleaned_count: result.cleaned_count, agent_ids: result.agent_ids || [], job_ids: result.job_ids || [] };
}

// ──────────────────────────────────────────────
// Handler: stuck-builds
// ──────────────────────────────────────────────
export async function handleCleanupStuckBuilds(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.rpc('cleanup_stuck_builds');
  if (error) throw new Error(`Cleanup function failed: ${error.message}`);
  const result = Array.isArray(data) && data.length > 0 ? data[0] : { cleaned_count: 0, build_ids: [] };
  return { success: true, cleaned_count: result.cleaned_count || 0, build_ids: result.build_ids || [] };
}

// ──────────────────────────────────────────────
// Handler: stuck-jobs
// ──────────────────────────────────────────────
export async function handleCleanupStuckJobs(supabase: SupabaseClient, requestId: string) {
  const MAX_DELIVERY_ATTEMPTS = 5;
  const STUCK_TIMEOUT_MINUTES = 10;
  const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Stuck delivered -> FAILED
  const { data: stuckDelivered, error: stuckError } = await supabase
    .from('jobs')
    .select('id, agent_name, type, delivered_at, delivery_attempts, expires_at')
    .eq('status', 'delivered')
    .lt('delivered_at', cutoffTime);

  if (stuckError) logger.error(`[${requestId}] [cleanup:stuck-jobs] Error fetching stuck delivered:`, stuckError);

  let failedDeliveredCount = 0;
  if (stuckDelivered && stuckDelivered.length > 0) {
    const retryable: typeof stuckDelivered = [];
    for (const job of stuckDelivered) {
      const attempts = job.delivery_attempts || 0;
      const expired = job.expires_at && new Date(job.expires_at) < new Date(now);
      if (attempts < MAX_DELIVERY_ATTEMPTS - 1 && !expired) retryable.push(job);
    }

    const allIds = stuckDelivered.map(j => j.id);
    if (allIds.length > 0) {
      const { error: failError } = await supabase
        .from('jobs')
        .update({ status: 'failed', completed_at: now, error_message: '[CLEANUP] Job delivered but agent never submitted result', failure_class: 'AGENT_STALLED' })
        .in('id', allIds);
      if (!failError) failedDeliveredCount = allIds.length;
    }

    for (const job of retryable) {
      const { data: fullJob } = await supabase
        .from('jobs')
        .select('tenant_id, agent_id, agent_name, type, payload, priority, expires_at')
        .eq('id', job.id)
        .single();
      if (fullJob?.type) {
        await supabase.from('jobs').insert({
          tenant_id: fullJob.tenant_id, agent_id: fullJob.agent_id, agent_name: fullJob.agent_name, type: fullJob.type,
          payload: fullJob.payload || {}, status: 'queued', approved: true, priority: fullJob.priority,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          delivery_attempts: (job.delivery_attempts || 0) + 1,
        });
      }
    }
  }

  // Zombie executions
  let zombieCleaned = { total: 0 };
  try {
    const { data: zombieResult } = await supabase.rpc('cleanup_zombie_executions');
    if (zombieResult) zombieCleaned = zombieResult as { total: number };
  } catch (_) { /* non-critical */ }

  // Expired TTL jobs
  const { data: expiredJobs } = await supabase
    .from('jobs')
    .select('id')
    .in('status', ['queued', 'delivered', 'pending'])
    .lt('expires_at', now);

  let expiredCount = 0;
  if (expiredJobs && expiredJobs.length > 0) {
    const { error: expireError } = await supabase
      .from('jobs')
      .update({ status: 'failed', error_message: '[DLQ:EXPIRED_TTL] Job expired (TTL exceeded)', completed_at: now, failure_class: 'EXPIRED' })
      .in('id', expiredJobs.map(j => j.id));
    if (!expireError) expiredCount = expiredJobs.length;
  }

  return {
    success: true, timestamp: now,
    stuck_delivered_failed: failedDeliveredCount,
    zombie_executions_cleaned: zombieCleaned.total,
    expired_failed: expiredCount,
    total_cleaned: failedDeliveredCount + expiredCount + zombieCleaned.total,
  };
}

// ──────────────────────────────────────────────
// Handler: auto-cleanup-jobs
// ──────────────────────────────────────────────
export async function handleAutoCleanupJobs(supabase: SupabaseClient, requestId: string, body: Record<string, unknown>) {
  // KILL SWITCH CHECK
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    return { success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' };
  }

  const queuedThresholdHours = (body.queued_threshold_hours as number) ?? 2;
  const deliveredThresholdHours = (body.delivered_threshold_hours as number) ?? 0.5;
  const targetTenantId = (body.tenant_id as string) ?? null;
  const enableRetry = (body.enable_retry as boolean) ?? true;

  const queuedCutoff = new Date(Date.now() - queuedThresholdHours * 60 * 60 * 1000).toISOString();
  const deliveredCutoff = new Date(Date.now() - deliveredThresholdHours * 60 * 60 * 1000).toISOString();

  // Cancel old queued jobs
  let queuedQuery = supabase.from('jobs').update({ status: 'cancelled', error_message: `Auto-cancelled: agent did not collect job within ${queuedThresholdHours}h`, completed_at: new Date().toISOString() }).eq('status', 'queued').lt('created_at', queuedCutoff);
  if (targetTenantId) queuedQuery = queuedQuery.eq('tenant_id', targetTenantId);
  const { data: cancelledJobs, error: cancelError } = await queuedQuery.select('id, tenant_id');
  if (cancelError) throw cancelError;

  // Fail old delivered jobs
  let deliveredQuery = supabase.from('jobs').update({ status: 'failed', error_message: `Timeout: agent did not report result within ${deliveredThresholdHours}h`, completed_at: new Date().toISOString() }).eq('status', 'delivered').lt('delivered_at', deliveredCutoff);
  if (targetTenantId) deliveredQuery = deliveredQuery.eq('tenant_id', targetTenantId);
  const { data: failedJobs, error: failError } = await deliveredQuery.select('id, tenant_id');
  if (failError) throw failError;

  const queuedCancelled = cancelledJobs?.length ?? 0;
  const deliveredFailed = failedJobs?.length ?? 0;
  const allJobs = [...(cancelledJobs ?? []), ...(failedJobs ?? [])];
  const tenantsAffected = [...new Set(allJobs.map(j => j.tenant_id))];

  // Retry recurring jobs
  let retriedCount = 0;
  if (enableRetry && failedJobs && failedJobs.length > 0) {
    for (const failedJob of failedJobs) {
      const { data: originalJob } = await supabase.from('jobs').select('type, agent_id, agent_name, tenant_id, payload, is_recurring').eq('id', failedJob.id).single();
      if (originalJob?.is_recurring && originalJob?.agent_id) {
        const { error: retryError } = await supabase.from('jobs').insert({
          type: originalJob.type, agent_id: originalJob.agent_id, agent_name: originalJob.agent_name, tenant_id: originalJob.tenant_id, status: 'queued', approved: true,
          payload: { ...(originalJob.payload as Record<string, unknown>), retry_of: failedJob.id, retry_count: ((originalJob.payload as Record<string, unknown>)?.retry_count as number || 0) + 1 },
          is_recurring: true, parent_job_id: failedJob.id,
        });
        if (!retryError) retriedCount++;
      }
    }
  }

  return { success: true, queued_cancelled: queuedCancelled, delivered_failed: deliveredFailed, total_cleaned: queuedCancelled + deliveredFailed, retried: retriedCount, tenants_affected: tenantsAffected };
}

// ──────────────────────────────────────────────
// Handler: security-cleanup
// ──────────────────────────────────────────────
export async function handleSecurityCleanup(supabase: SupabaseClient, requestId: string) {
  const now = new Date();
  const stats = { hmac_signatures_deleted: 0, rate_limits_deleted: 0, failed_logins_deleted: 0, ip_blocklist_deleted: 0, old_metrics_deleted: 0, security_logs_archived: 0 };

  // 1. HMAC signatures > 24h
  const hmacCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { data: hmacDeleted } = await supabase.from('hmac_signatures').delete().lt('used_at', hmacCutoff.toISOString()).select('id');
  stats.hmac_signatures_deleted = hmacDeleted?.length || 0;

  // 2. Rate limits > 2h
  const rlCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const { data: rlDeleted } = await supabase.from('rate_limits').delete().lt('window_start', rlCutoff.toISOString()).select('id');
  stats.rate_limits_deleted = rlDeleted?.length || 0;

  // 3. Failed logins > 30 days
  const flCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: flDeleted } = await supabase.from('failed_login_attempts').delete().lt('created_at', flCutoff.toISOString()).select('id');
  stats.failed_logins_deleted = flDeleted?.length || 0;

  // 4. Expired IP blocklist
  const { data: ipDeleted } = await supabase.from('ip_blocklist').delete().lt('blocked_until', now.toISOString()).select('id');
  stats.ip_blocklist_deleted = ipDeleted?.length || 0;

  // 5. Old metrics > 30 days
  const metricsCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: metricsDeleted } = await supabase.from('agent_system_metrics_partitioned').delete().lt('collected_at', metricsCutoff.toISOString()).select('id');
  stats.old_metrics_deleted = metricsDeleted?.length || 0;

  // 6. Security logs > 90 days
  const slCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const { data: slDeleted } = await supabase.from('security_logs').delete().lt('created_at', slCutoff.toISOString()).select('id');
  stats.security_logs_archived = slDeleted?.length || 0;

  await supabase.from('audit_logs').insert({ action: 'security_cleanup', resource_type: 'system', success: true, details: { request_id: requestId, stats, run_at: now.toISOString() } });

  const totalDeleted = Object.values(stats).reduce((a, b) => a + b, 0);
  return { success: true, stats, total_deleted: totalDeleted };
}

// ──────────────────────────────────────────────
// Handler: cleanup-jobs (admin, JWT auth)
// ──────────────────────────────────────────────
export async function handleCleanupJobs(supabase: SupabaseClient, requestId: string, body: Record<string, unknown>, tenantId: string) {
  const status = (body.status as string[]) || ['failed', 'delivered'];
  const older_than_days = (body.older_than_days as number) || 7;
  const agent_name = body.agent_name as string | undefined;
  const only_undelivered = (body.only_undelivered as boolean) ?? true;
  const require_no_executions = (body.require_no_executions as boolean) ?? true;

  const cutoffDate = new Date();
  if (older_than_days > 0) cutoffDate.setDate(cutoffDate.getDate() - older_than_days);

  let parentQuery = supabase.from('jobs').select('id').eq('tenant_id', tenantId);
  if (status.length > 0) parentQuery = parentQuery.in('status', status);
  if (older_than_days > 0) parentQuery = parentQuery.lt('created_at', cutoffDate.toISOString());
  if (agent_name) parentQuery = parentQuery.eq('agent_name', agent_name);
  if (only_undelivered) parentQuery = parentQuery.is('delivered_at', null);

  const { data: parentJobs, error: parentQueryError } = await parentQuery;
  if (parentQueryError) throw new Error(`Failed to query jobs: ${parentQueryError.message}`);

  if (!parentJobs || parentJobs.length === 0) {
    return { success: true, deleted_count: 0, skipped_count: 0, filters: { status, older_than_days, agent_name, only_undelivered, require_no_executions }, requestId };
  }

  let parentIds = parentJobs.map(j => j.id);
  let skippedCount = 0;

  if (require_no_executions && parentIds.length > 0) {
    const { data: jobsWithExecutions } = await supabase.from('job_executions').select('job_id').in('job_id', parentIds);
    const jobsWithExecSet = new Set((jobsWithExecutions || []).map(e => e.job_id));
    const originalCount = parentIds.length;
    parentIds = parentIds.filter(id => !jobsWithExecSet.has(id));
    skippedCount = originalCount - parentIds.length;
  }

  if (parentIds.length === 0) {
    return { success: true, deleted_count: 0, skipped_count: skippedCount, skipped_reason: 'Jobs com execucoes recentes nao podem ser removidos', filters: { status, older_than_days, agent_name, only_undelivered, require_no_executions }, requestId };
  }

  const BATCH_SIZE = 100;
  let totalDeleted = 0;
  for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
    const batch = parentIds.slice(i, i + BATCH_SIZE);
    await supabase.from('generated_reports').delete().in('job_id', batch);
    await supabase.from('jobs').delete().in('parent_job_id', batch);
    const { data: deletedJobs } = await supabase.from('jobs').delete().in('id', batch).select('id');
    totalDeleted += deletedJobs?.length || 0;
  }

  return { success: true, deleted_count: totalDeleted, skipped_count: skippedCount, skipped_reason: skippedCount > 0 ? 'Jobs com execucoes nao podem ser removidos' : null, filters: { status, older_than_days, agent_name, only_undelivered, require_no_executions }, requestId };
}
