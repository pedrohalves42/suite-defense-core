import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts'
import { recordMetric } from '../_shared/apm.ts'
import { logger } from '../_shared/logger.ts';

/**
 * CONSOLIDATED maintenance-cron (COST-OPT v9)
 * 
 * Replaces 8 individual cron cleanup functions:
 *   - cleanup-stuck-jobs (stuck delivered→failed, zombie executions, expired TTL)
 *   - auto-cleanup-jobs (old queued→cancelled, delivered→failed)
 *   - cleanup-offline-agents-jobs (RPC cleanup_offline_agents_jobs)
 *   - cleanup-stale-playbooks (stale playbook executions)
 *   - cleanup-stale-reports (stale security reports)
 *   - cleanup-stale-updates (stale force_update flags)
 *   - cleanup-stuck-builds (RPC cleanup_stuck_builds)
 *   - cleanup-telemetry (expired telemetry + summarization)
 * 
 * Auth: Internal (service_role / cron / X-Internal-Secret)
 */

const STUCK_TIMEOUT_MINUTES = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const PLAYBOOK_TIMEOUT_MINUTES = 30;
const REPORT_STALE_HOURS = 24;
const UPDATE_MAX_STALE_HOURS = 168; // 7 days
const UPDATE_MAX_DELIVERY_COUNT = 10;

interface ConsolidatedResult {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const startTime = Date.now();
  const now = new Date().toISOString();

  const result: ConsolidatedResult = {
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

  try {
    // ═══════════════════════════════════════════
    // PHASE 1: Core maintenance RPC (existing)
    // ═══════════════════════════════════════════
    try {
      const { data, error } = await supabase.rpc('run_maintenance_v2', {
        p_expire_limit: 500,
        p_archive_limit: 1000,
      });
      if (error) logger.error('[maintenance] run_maintenance_v2 failed:', error.message);
      else result.maintenance_rpc = data || {};
    } catch (e) { logger.warn('[maintenance] Phase 1 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 2: Stuck delivered jobs → failed
    // (was: cleanup-stuck-jobs)
    // ═══════════════════════════════════════════
    try {
      const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();

      // Stuck delivered jobs
      const { data: stuckDelivered } = await supabase
        .from('jobs')
        .select('id, agent_name, type, delivered_at, delivery_attempts, expires_at, tenant_id, agent_id, payload, priority')
        .eq('status', 'delivered')
        .lt('delivered_at', cutoffTime);

      if (stuckDelivered && stuckDelivered.length > 0) {
        const allIds = stuckDelivered.map(j => j.id);
        const { error: failError } = await supabase
          .from('jobs')
          .update({
            status: 'failed',
            completed_at: now,
            error_message: '[CLEANUP] Job delivered but agent never submitted result',
            failure_class: 'AGENT_STALLED'
          })
          .in('id', allIds);

        if (!failError) result.stuck_jobs.failed = allIds.length;

        // Recreate retryable jobs — only for agents that are still online
        const retryable = stuckDelivered.filter(j =>
          (j.delivery_attempts || 0) < MAX_DELIVERY_ATTEMPTS - 1 &&
          !(j.expires_at && new Date(j.expires_at) < new Date(now))
        );

        // V-OFFLINE: Check agent online status before recreating jobs
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        
        for (const job of retryable) {
          // Verify agent is still online before recreating
          const { data: agentCheck } = await supabase
            .from('agents')
            .select('last_heartbeat, status, scheduling_paused')
            .eq('id', job.agent_id)
            .maybeSingle();
          
          const isOnline = agentCheck && 
            agentCheck.status === 'active' && 
            !agentCheck.scheduling_paused &&
            agentCheck.last_heartbeat && 
            agentCheck.last_heartbeat > twoHoursAgo;
          
          if (!isOnline) {
            logger.info(`[maintenance-cron] Skipping job recreation for offline agent ${job.agent_name}`);
            continue;
          }
          
          const { error: insertError } = await supabase.from('jobs').insert({
            tenant_id: job.tenant_id,
            agent_id: job.agent_id,
            agent_name: job.agent_name,
            type: job.type,
            payload: job.payload || {},
            status: 'queued',
            approved: true,
            priority: job.priority,
            expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            delivery_attempts: (job.delivery_attempts || 0) + 1
          });
          if (!insertError) result.stuck_jobs.recreated++;
        }
      }

      // Expired TTL jobs
      const { data: expiredJobs } = await supabase
        .from('jobs')
        .select('id')
        .in('status', ['queued', 'delivered', 'pending'])
        .lt('expires_at', now);

      if (expiredJobs && expiredJobs.length > 0) {
        const { error: expireError } = await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: '[DLQ:EXPIRED_TTL] Job expired (TTL exceeded)',
            completed_at: now,
            failure_class: 'EXPIRED'
          })
          .in('id', expiredJobs.map(j => j.id));
        if (!expireError) result.stuck_jobs.expired = expiredJobs.length;
      }

      // Zombie executions
      try {
        const { data: zombieResult } = await supabase.rpc('cleanup_zombie_executions');
        if (zombieResult) result.stuck_jobs.zombies = (zombieResult as any).total || 0;
      } catch { /* non-critical */ }
    } catch (e) { logger.warn('[maintenance] Phase 2 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 3: Auto cleanup old jobs
    // (was: auto-cleanup-jobs)
    // ═══════════════════════════════════════════
    try {
      const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
      if (systemMode !== 'halt_jobs') {
        const queuedCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h
        const deliveredCutoff = new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString(); // 30min

        const { data: cancelled } = await supabase
          .from('jobs')
          .update({
            status: 'cancelled',
            error_message: 'Auto-cancelled: agent did not collect job within 2h',
            completed_at: now
          })
          .eq('status', 'queued')
          .lt('created_at', queuedCutoff)
          .select('id');

        result.auto_cleanup.queued_cancelled = cancelled?.length ?? 0;

        const { data: failed } = await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: 'Timeout: agent did not report result within 30min',
            completed_at: now
          })
          .eq('status', 'delivered')
          .lt('delivered_at', deliveredCutoff)
          .select('id');

        result.auto_cleanup.delivered_failed = failed?.length ?? 0;
      }
    } catch (e) { logger.warn('[maintenance] Phase 3 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 4: Offline agents jobs cleanup
    // (was: cleanup-offline-agents-jobs)
    // ═══════════════════════════════════════════
    try {
      const { data } = await supabase.rpc('cleanup_offline_agents_jobs');
      const r = data?.[0] || data;
      result.offline_agents.cleaned = r?.cleaned_count || 0;
    } catch (e) { logger.warn('[maintenance] Phase 4 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 5: Stale playbook executions
    // (was: cleanup-stale-playbooks)
    // ═══════════════════════════════════════════
    try {
      const playbookCutoff = new Date(Date.now() - PLAYBOOK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
      const { data: staleExecs } = await supabase
        .from('playbook_executions')
        .select('id, tenant_id')
        .in('status', ['pending', 'in_progress'])
        .lt('started_at', playbookCutoff);

      if (staleExecs && staleExecs.length > 0) {
        const { error } = await supabase
          .from('playbook_executions')
          .update({
            status: 'failed',
            completed_at: now,
            notes: `Timeout automático: execução excedeu ${PLAYBOOK_TIMEOUT_MINUTES} minutos`,
          })
          .in('id', staleExecs.map(e => e.id));
        if (!error) result.stale_playbooks.cleaned = staleExecs.length;
      }
    } catch (e) { logger.warn('[maintenance] Phase 5 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 6: Stale security reports
    // (was: cleanup-stale-reports)
    // ═══════════════════════════════════════════
    try {
      const reportCutoff = new Date(Date.now() - REPORT_STALE_HOURS * 60 * 60 * 1000).toISOString();
      const { data: staleReports } = await supabase
        .from('security_reports')
        .select('id')
        .in('status', ['pending', 'processing'])
        .lt('created_at', reportCutoff);

      if (staleReports && staleReports.length > 0) {
        const { error } = await supabase
          .from('security_reports')
          .update({
            status: 'failed',
            error_message: `Relatório travado por mais de ${REPORT_STALE_HOURS}h`,
            updated_at: now,
          })
          .in('id', staleReports.map(r => r.id));
        if (!error) result.stale_reports.cleaned = staleReports.length;
      }
    } catch (e) { logger.warn('[maintenance] Phase 6 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 7: Stale force_update flags
    // (was: cleanup-stale-updates)
    // ═══════════════════════════════════════════
    try {
      const updateCutoff = new Date(Date.now() - UPDATE_MAX_STALE_HOURS * 60 * 60 * 1000).toISOString();

      const { data: staleByTime } = await supabase
        .from('agents')
        .select('id, agent_name, tenant_id, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason')
        .not('force_update_version', 'is', null)
        .lt('force_update_at', updateCutoff);

      const { data: staleByCount } = await supabase
        .from('agents')
        .select('id, agent_name, tenant_id, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason')
        .not('force_update_version', 'is', null)
        .gte('force_update_delivery_count', UPDATE_MAX_DELIVERY_COUNT);

      const allStale = new Map<string, any>();
      for (const a of [...(staleByTime || []), ...(staleByCount || [])]) {
        if (a.force_update_reason === 'auto_retrigger_72h_offline' && (a.force_update_delivery_count || 0) === 0) continue;
        allStale.set(a.id, a);
      }

      for (const agent of allStale.values()) {
        const { error } = await supabase
          .from('agents')
          .update({ force_update_version: null, force_update_reason: null, force_update_at: null, force_update_delivery_count: 0 })
          .eq('id', agent.id);

        if (!error) {
          result.stale_updates.cleaned++;
          await supabase.from('agent_evidence_logs').insert({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            agent_version: agent.agent_version,
            tenant_id: agent.tenant_id,
            event_type: 'force_update_auto_cancelled',
            event_data: { cancelled_version: agent.force_update_version, cleaned_by: 'maintenance-cron' },
            evidence_hash: crypto.randomUUID(),
            severity: 'warn'
          });
        }
      }
    } catch (e) { logger.warn('[maintenance] Phase 7 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 8: Stuck builds
    // (was: cleanup-stuck-builds)
    // ═══════════════════════════════════════════
    try {
      const { data } = await supabase.rpc('cleanup_stuck_builds');
      const r = Array.isArray(data) && data.length > 0 ? data[0] : data;
      result.stuck_builds.cleaned = r?.cleaned_count || 0;
    } catch (e) { logger.warn('[maintenance] Phase 8 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 9: Telemetry cleanup & summarization
    // (was: cleanup-telemetry)
    // ═══════════════════════════════════════════
    try {
      const { error: cleanupError } = await supabase.rpc('cleanup_expired_telemetry');
      result.telemetry.cleanup_done = !cleanupError;

      const { data: tenants } = await supabase
        .from('telemetry_retention_config')
        .select('tenant_id')
        .eq('is_enabled', true);

      const uniqueTenants = [...new Set((tenants || []).map(t => t.tenant_id))];
      const CONCURRENCY = 5;

      for (let i = 0; i < uniqueTenants.length; i += CONCURRENCY) {
        const batch = uniqueTenants.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(tenantId =>
            supabase.rpc('summarize_telemetry_hourly', { p_tenant_id: tenantId, p_hours_ago: 2 })
              .then(() => { result.telemetry.tenants_summarized++; })
              .catch((e: any) => logger.warn(`[maintenance] Telemetry summary error for ${tenantId}:`, e))
          )
        );
      }
    } catch (e) { logger.warn('[maintenance] Phase 9 error:', e); }

    // ═══════════════════════════════════════════
    // PHASE 10: Session store cleanup + token rotation flags
    // ═══════════════════════════════════════════
    try {
      await supabase.rpc('cleanup_expired_sessions');
      logger.info('[maintenance] Phase 10: expired sessions cleaned');
    } catch (e) { logger.warn('[maintenance] Phase 10 error:', e); }

    // ═══════════════════════════════════════════
    // FINALIZE
    // ═══════════════════════════════════════════
    result.duration_ms = Date.now() - startTime;
    result.total_operations =
      result.stuck_jobs.failed + result.stuck_jobs.recreated + result.stuck_jobs.expired + result.stuck_jobs.zombies +
      result.auto_cleanup.queued_cancelled + result.auto_cleanup.delivered_failed +
      result.offline_agents.cleaned +
      result.stale_playbooks.cleaned +
      result.stale_reports.cleaned +
      result.stale_updates.cleaned +
      result.stuck_builds.cleaned;

    logger.info(`[maintenance-cron] Completed in ${result.duration_ms}ms: ${result.total_operations} operations`);

    // APM metric
    recordMetric({
      function_name: 'maintenance-cron',
      operation_type: 'edge_function',
      duration_ms: result.duration_ms,
      status_code: 200,
      metadata: result as unknown as Record<string, any>
    }).catch(() => {});

    // Log observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'maintenance-cron-consolidated',
        p_success: true,
        p_duration_ms: result.duration_ms,
        p_result: result,
        p_processed_count: result.total_operations,
        p_job_source: 'cron'
      });
    } catch { /* non-critical */ }

    // Cron health
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'maintenance-cron',
        p_success: true,
        p_details: result,
      });
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[maintenance-cron] Fatal error:', err.message);
    result.duration_ms = Date.now() - startTime;

    try {
      await supabase.rpc('mark_cron_failure', { p_cron_name: 'maintenance-cron', p_error: err.message });
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({ success: false, error: err.message, ...result }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
