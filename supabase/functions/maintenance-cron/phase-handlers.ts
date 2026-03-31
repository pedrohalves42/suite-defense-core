/**
 * Phase handlers for maintenance-cron
 * Extraído de maintenance-cron/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const STUCK_TIMEOUT_MINUTES = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const PLAYBOOK_TIMEOUT_MINUTES = 30;
const REPORT_STALE_HOURS = 24;
const UPDATE_MAX_STALE_HOURS = 168;
const UPDATE_MAX_DELIVERY_COUNT = 10;

export interface ConsolidatedResult {
  maintenance_rpc: Record<string, unknown>;
  stuck_jobs: { failed: number; recreated: number; expired: number; zombies: number };
  auto_cleanup: { queued_cancelled: number; delivered_failed: number };
  offline_agents: { cleaned: number };
  stale_playbooks: { cleaned: number };
  stale_reports: { cleaned: number };
  stale_updates: { cleaned: number };
  stuck_builds: { cleaned: number };
  telemetry: { cleanup_done: boolean; tenants_summarized: number };
  total_operations: number;
  duration_ms: number;
}

export function createEmptyResult(): ConsolidatedResult {
  return {
    maintenance_rpc: {},
    stuck_jobs: { failed: 0, recreated: 0, expired: 0, zombies: 0 },
    auto_cleanup: { queued_cancelled: 0, delivered_failed: 0 },
    offline_agents: { cleaned: 0 },
    stale_playbooks: { cleaned: 0 },
    stale_reports: { cleaned: 0 },
    stale_updates: { cleaned: 0 },
    stuck_builds: { cleaned: 0 },
    telemetry: { cleanup_done: false, tenants_summarized: 0 },
    total_operations: 0,
    duration_ms: 0,
  };
}

interface JobRow { id: string; agent_name?: string; type?: string; delivered_at?: string; delivery_attempts?: number; expires_at?: string; tenant_id?: string; agent_id?: string; payload?: Record<string, unknown>; priority?: number }
interface IdRow { id: string }
interface TenantRow { tenant_id: string }

/** Phase 1: Core maintenance RPC */
export async function runMaintenanceRpc(supabase: SupabaseClient, result: ConsolidatedResult): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('run_maintenance_v2', { p_expire_limit: 500, p_archive_limit: 1000 });
    if (error) logger.error('[maintenance] run_maintenance_v2 failed:', error.message);
    else result.maintenance_rpc = data || {};
  } catch (e) { logger.warn('[maintenance] Phase 1 error:', e); }
}

/** Phase 2: Stuck delivered jobs → failed */
export async function cleanupStuckJobs(supabase: SupabaseClient, now: string, result: ConsolidatedResult): Promise<void> {
  try {
    const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    const { data: stuckDelivered } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivered_at, delivery_attempts, expires_at, tenant_id, agent_id, payload, priority')
      .eq('status', 'delivered')
      .lt('delivered_at', cutoffTime);

    if (stuckDelivered && stuckDelivered.length > 0) {
      const allIds = stuckDelivered.map((j: JobRow) => j.id);
      const { error: failError } = await supabase.from('jobs')
        .update({ status: 'failed', completed_at: now, error_message: '[CLEANUP] Job delivered but agent never submitted result', failure_class: 'AGENT_STALLED' })
        .in('id', allIds);
      if (!failError) result.stuck_jobs.failed = allIds.length;

      const retryable = stuckDelivered.filter((j: JobRow) => (j.delivery_attempts || 0) < MAX_DELIVERY_ATTEMPTS - 1 && !(j.expires_at && new Date(j.expires_at) < new Date(now)));
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      for (const job of retryable) {
        const { data: agentCheck } = await supabase.from('agents').select('last_heartbeat, status, scheduling_paused').eq('id', job.agent_id).maybeSingle();
        const isOnline = agentCheck && agentCheck.status === 'active' && !agentCheck.scheduling_paused && agentCheck.last_heartbeat && agentCheck.last_heartbeat > twoHoursAgo;
        if (!isOnline) continue;

        const { error: insertError } = await supabase.from('jobs').insert({
          tenant_id: job.tenant_id, agent_id: job.agent_id, agent_name: job.agent_name, type: job.type,
          payload: job.payload || {}, status: 'queued', approved: true, priority: job.priority,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          delivery_attempts: (job.delivery_attempts || 0) + 1,
        });
        if (!insertError) result.stuck_jobs.recreated++;
      }
    }

    // Expired TTL
    const { data: expiredJobs } = await supabase.from('jobs').select('id').in('status', ['queued', 'delivered', 'pending']).lt('expires_at', now);
    if (expiredJobs && expiredJobs.length > 0) {
      const { error: expireError } = await supabase.from('jobs')
        .update({ status: 'failed', error_message: '[DLQ:EXPIRED_TTL] Job expired (TTL exceeded)', completed_at: now, failure_class: 'EXPIRED' })
        .in('id', expiredJobs.map((j: IdRow) => j.id));
      if (!expireError) result.stuck_jobs.expired = expiredJobs.length;
    }

    // Zombie executions
    try {
      const { data: zombieResult } = await supabase.rpc('cleanup_zombie_executions');
      if (zombieResult) result.stuck_jobs.zombies = (zombieResult as Record<string, unknown>).total || 0;
    } catch (err) { console.warn('[maintenance] cleanup_zombie_executions failed', err); }
  } catch (e) { logger.warn('[maintenance] Phase 2 error:', e); }
}

/** Phase 3: Auto cleanup old jobs */
export async function autoCleanupJobs(supabase: SupabaseClient, now: string, result: ConsolidatedResult): Promise<void> {
  try {
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') return;

    const queuedCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const deliveredCutoff = new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString();

    const { data: cancelled } = await supabase.from('jobs')
      .update({ status: 'cancelled', error_message: 'Auto-cancelled: agent did not collect job within 2h', completed_at: now })
      .eq('status', 'queued').lt('created_at', queuedCutoff).select('id');
    result.auto_cleanup.queued_cancelled = cancelled?.length ?? 0;

    const { data: failed } = await supabase.from('jobs')
      .update({ status: 'failed', error_message: 'Timeout: agent did not report result within 30min', completed_at: now })
      .eq('status', 'delivered').lt('delivered_at', deliveredCutoff).select('id');
    result.auto_cleanup.delivered_failed = failed?.length ?? 0;
  } catch (e) { logger.warn('[maintenance] Phase 3 error:', e); }
}

/** Phase 4-9: Remaining cleanup phases */
export async function runRemainingPhases(supabase: SupabaseClient, now: string, result: ConsolidatedResult): Promise<void> {
  // Phase 4: Offline agents
  try {
    const { data } = await supabase.rpc('cleanup_offline_agents_jobs');
    const r = data?.[0] || data;
    result.offline_agents.cleaned = r?.cleaned_count || 0;
  } catch (e) { logger.warn('[maintenance] Phase 4 error:', e); }

  // Phase 5: Stale playbooks
  try {
    const playbookCutoff = new Date(Date.now() - PLAYBOOK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    const { data: staleExecs } = await supabase.from('playbook_executions').select('id, tenant_id').in('status', ['pending', 'in_progress']).lt('started_at', playbookCutoff);
    if (staleExecs && staleExecs.length > 0) {
      const { error } = await supabase.from('playbook_executions')
        .update({ status: 'failed', completed_at: now, notes: `Timeout automatico: execucao excedeu ${PLAYBOOK_TIMEOUT_MINUTES} minutos` })
        .in('id', staleExecs.map((e: IdRow) => e.id));
      if (!error) result.stale_playbooks.cleaned = staleExecs.length;
    }
  } catch (e) { logger.warn('[maintenance] Phase 5 error:', e); }

  // Phase 6: Stale reports
  try {
    const reportCutoff = new Date(Date.now() - REPORT_STALE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: staleReports } = await supabase.from('security_reports').select('id').in('status', ['pending', 'processing']).lt('created_at', reportCutoff);
    if (staleReports && staleReports.length > 0) {
      const { error } = await supabase.from('security_reports')
        .update({ status: 'failed', error_message: `Relatorio travado por mais de ${REPORT_STALE_HOURS}h`, updated_at: now })
        .in('id', staleReports.map((r: IdRow) => r.id));
      if (!error) result.stale_reports.cleaned = staleReports.length;
    }
  } catch (e) { logger.warn('[maintenance] Phase 6 error:', e); }

  // Phase 7: Stale updates
  try {
    const updateCutoff = new Date(Date.now() - UPDATE_MAX_STALE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: staleByTime } = await supabase.from('agents')
      .select('id, agent_name, tenant_id, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason')
      .not('force_update_version', 'is', null).lt('force_update_at', updateCutoff);
    const { data: staleByCount } = await supabase.from('agents')
      .select('id, agent_name, tenant_id, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason')
      .not('force_update_version', 'is', null).gte('force_update_delivery_count', UPDATE_MAX_DELIVERY_COUNT);

    interface StaleAgent { id: string; agent_name: string; tenant_id: string; agent_version: string; force_update_version: string; force_update_at: string; force_update_delivery_count: number; force_update_reason: string }
    const allStale = new Map<string, StaleAgent>();
    for (const a of [...(staleByTime || []), ...(staleByCount || [])]) {
      if (a.force_update_reason === 'auto_retrigger_72h_offline' && (a.force_update_delivery_count || 0) === 0) continue;
      allStale.set(a.id, a as StaleAgent);
    }

    for (const agent of allStale.values()) {
      const { error } = await supabase.from('agents')
        .update({ force_update_version: null, force_update_reason: null, force_update_at: null, force_update_delivery_count: 0 })
        .eq('id', agent.id);
      if (!error) {
        result.stale_updates.cleaned++;
        await supabase.from('agent_evidence_logs').insert({
          agent_id: agent.id, agent_name: agent.agent_name, agent_version: agent.agent_version, tenant_id: agent.tenant_id,
          event_type: 'force_update_auto_cancelled', event_data: { cancelled_version: agent.force_update_version, cleaned_by: 'maintenance-cron' },
          evidence_hash: crypto.randomUUID(), severity: 'warn',
        });
      }
    }
  } catch (e) { logger.warn('[maintenance] Phase 7 error:', e); }

  // Phase 8: Stuck builds
  try {
    const { data } = await supabase.rpc('cleanup_stuck_builds');
    const r = Array.isArray(data) && data.length > 0 ? data[0] : data;
    result.stuck_builds.cleaned = r?.cleaned_count || 0;
  } catch (e) { logger.warn('[maintenance] Phase 8 error:', e); }

  // Phase 9: Telemetry
  try {
    const { error: cleanupError } = await supabase.rpc('cleanup_expired_telemetry');
    result.telemetry.cleanup_done = !cleanupError;
    const { data: tenants } = await supabase.from('telemetry_retention_config').select('tenant_id').eq('is_enabled', true);
    const uniqueTenants = [...new Set((tenants || []).map((t: TenantRow) => t.tenant_id))];
    const CONCURRENCY = 5;
    for (let i = 0; i < uniqueTenants.length; i += CONCURRENCY) {
      const batch = uniqueTenants.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((tenantId: string) =>
          supabase.rpc('summarize_telemetry_hourly', { p_tenant_id: tenantId, p_hours_ago: 2 })
            .then(() => { result.telemetry.tenants_summarized++; })
            .catch((e: Record<string, unknown>) => logger.warn(`[maintenance] Telemetry summary error for ${tenantId}:`, e))
        )
      );
    }
  } catch (e) { logger.warn('[maintenance] Phase 9 error:', e); }

  // Phase 10: Sessions
  try {
    await supabase.rpc('cleanup_expired_sessions');
    logger.info('[maintenance] Phase 10: expired sessions cleaned');
  } catch (e) { logger.warn('[maintenance] Phase 10 error:', e); }
}

/** Compute total_operations */
export function computeTotalOps(result: ConsolidatedResult): number {
  return result.stuck_jobs.failed + result.stuck_jobs.recreated + result.stuck_jobs.expired + result.stuck_jobs.zombies +
    result.auto_cleanup.queued_cancelled + result.auto_cleanup.delivered_failed +
    result.offline_agents.cleaned + result.stale_playbooks.cleaned +
    result.stale_reports.cleaned + result.stale_updates.cleaned + result.stuck_builds.cleaned;
}
