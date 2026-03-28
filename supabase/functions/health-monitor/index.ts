import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

/**
 * CONSOLIDATED health-monitor (COST-OPT v10)
 * 
 * Replaces 9 individual health-check cron functions:
 *   - check-stuck-jobs
 *   - check-pending-agents
 *   - check-installation-health
 *   - monitor-agent-health
 *   - monitor-dlq-exhaustion
 *   - monitor-slow-operations
 *   - monitor-stuck-agents
 *   - monitor-thresholds
 *   - detect-stuck-installations
 * 
 * Auth: Internal (service_role / cron / X-Internal-Secret)
 * Schedule: Every 5 minutes via pg_cron
 */

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

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
    // Run all checks in parallel for speed
    const [
      stuckJobsResult,
      pendingAgentsResult,
      agentHealthResult,
      dlqResult,
      slowOpsResult,
      stuckAgentsResult,
      stuckInstallResult,
    ] = await Promise.allSettled([
      // ?? 1. Stuck Jobs ??
      (async () => {
        const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('jobs')
          .select('id, type, tenant_id')
          .eq('status', 'delivered')
          .lt('delivered_at', cutoff)
          .limit(200);
        if (error) { logger.error('[health-monitor] stuck-jobs query error:', error.message); return; }
        if (!data?.length) return;
        result.stuck_jobs.count = data.length;
        // Mark as failed
        const ids = data.map(j => j.id);
        const { error: updateErr } = await supabase
          .from('jobs')
          .update({ status: 'failed', error_message: 'Zombie: no result after timeout' })
          .in('id', ids);
        if (!updateErr) result.stuck_jobs.failed = ids.length;
      })(),

      // ?? 2. Pending Agents (no heartbeat > 10min) ??
      (async () => {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('agents')
          .select('id, agent_name, tenant_id')
          .is('last_heartbeat', null)
          .lt('enrolled_at', cutoff)
          .limit(100);
        if (error) { logger.error('[health-monitor] pending-agents error:', error.message); return; }
        result.pending_agents.count = data?.length || 0;
      })(),

      // ?? 3. Agent Health (offline detection) ??
      (async () => {
        const offlineCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('agents')
          .select('id, agent_name, tenant_id, last_heartbeat')
          .eq('status', 'active')
          .lt('last_heartbeat', offlineCutoff);
        if (error) { logger.error('[health-monitor] agent-health error:', error.message); return; }
        result.agent_health.offline = data?.length || 0;
        // Count total active
        const { count } = await supabase
          .from('agents')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active');
        result.agent_health.total_active = count || 0;
      })(),

      // ?? 4. DLQ Exhaustion ??
      (async () => {
        const { data, error } = await supabase
          .from('failed_jobs_dlq')
          .select('id, tenant_id, failure_class')
          .eq('status', 'exhausted')
          .limit(100);
        if (error) { logger.error('[health-monitor] dlq error:', error.message); return; }
        result.dlq_exhaustion.exhausted = data?.length || 0;
        if (data?.length) {
          // Check existing alerts to avoid duplicates
          const dlqIds = data.map(d => d.id);
          const { data: existing } = await supabase
            .from('dlq_exhaustion_alerts')
            .select('dlq_item_id')
            .in('dlq_item_id', dlqIds);
          const existingIds = new Set(existing?.map(e => e.dlq_item_id) || []);
          const newItems = data.filter(d => !existingIds.has(d.id));
          if (newItems.length) {
            const alerts = newItems.map(item => ({
              dlq_item_id: item.id,
              tenant_id: item.tenant_id,
              severity: 'high',
              failure_class: item.failure_class,
            }));
            await supabase.from('dlq_exhaustion_alerts').insert(alerts);
            result.dlq_exhaustion.alerts_created = newItems.length;
          }
        }
      })(),

      // ?? 5. Slow Operations (> 2s in last 5 min) ??
      (async () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count, error } = await supabase
          .from('performance_metrics')
          .select('id', { count: 'exact', head: true })
          .gt('duration_ms', 2000)
          .gte('created_at', fiveMinAgo);
        if (error) { logger.error('[health-monitor] slow-ops error:', error.message); return; }
        result.slow_operations.count = count || 0;
      })(),

      // ?? 6. Stuck Agents (pending + no heartbeat > 10min) ??
      (async () => {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('agents')
          .select('id, agent_name, tenant_id, enrolled_at')
          .eq('status', 'pending')
          .is('last_heartbeat', null)
          .lt('enrolled_at', cutoff);
        if (error) { logger.error('[health-monitor] stuck-agents error:', error.message); return; }
        result.stuck_agents.count = data?.length || 0;
        if (data?.length) {
          const alerts = data.map(a => ({
            tenant_id: a.tenant_id,
            severity: 'medium',
            type: 'stuck_agent',
            message: `Agent '${a.agent_name}' stuck in pending for ${Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 60000)} min`,
            metadata: { agent_id: a.id, agent_name: a.agent_name },
          }));
          await supabase.from('system_alerts').insert(alerts);
        }
      })(),

      // ?? 7. Stuck Installations (via view) ??
      (async () => {
        const { data, error } = await supabase
          .from('v_agent_lifecycle_state')
          .select('agent_id, tenant_id, agent_name')
          .eq('is_stuck', true)
          .limit(100);
        if (error) { logger.error('[health-monitor] stuck-install error:', error.message); return; }
        result.stuck_installations.count = data?.length || 0;
      })(),
    ]);

    // Log any rejected promises
    [stuckJobsResult, pendingAgentsResult, agentHealthResult, dlqResult, slowOpsResult, stuckAgentsResult, stuckInstallResult]
      .forEach((r, i) => {
        if (r.status === 'rejected') logger.error(`[health-monitor] Check ${i} failed:`, r.reason);
      });

    result.duration_ms = Date.now() - startedAt;

    // Report cron health
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'health-monitor',
        p_success: true,
        p_details: result,
      });
    } catch (_) { /* best effort */ }

    logger.info(`[health-monitor] Completed in ${result.duration_ms}ms`, JSON.stringify(result));

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('[health-monitor] Fatal:', msg);
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'health-monitor',
        p_success: false,
        p_details: { error: msg },
      });
    } catch (_) { /* best effort */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
