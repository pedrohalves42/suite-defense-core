/**
 * P1-01: Check Stuck Jobs - Migrated to assertInternalCaller
 * Uses per-type zombie thresholds for adaptive detection.
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

interface StuckJob {
  id: string;
  agent_name: string;
  type: string;
  delivered_at: string;
  tenant_id: string;
  minutes_stuck: number;
}

function getZombieThresholdMinutes(jobType: string): number {
  if (jobType === 'health_check' || jobType === 'config') return 15;
  if (jobType.startsWith('collect_') || jobType === 'light_vuln_scan' || jobType === 'integration_test_v3') return 30;
  if (jobType === 'software_inventory_collect' || jobType === 'disk_cleanup') return 60;
  if (jobType === 'update_agent' || jobType === 'apply_security_patch' || jobType === 'reinstall_agent') return 120;
  return 45;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] Starting stuck jobs check (adaptive thresholds)`);

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: deliveredJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivered_at, tenant_id')
      .eq('status', 'delivered');

    if (fetchError) throw fetchError;

    if (!deliveredJobs || deliveredJobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, stuck_jobs: 0, alerts_created: 0, auto_failed: 0, timestamp: new Date().toISOString() }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const stuckJobs: StuckJob[] = [];
    const autoFailIds: string[] = [];

    for (const job of deliveredJobs) {
      const minutesStuck = Math.floor((Date.now() - new Date(job.delivered_at).getTime()) / (1000 * 60));
      const threshold = getZombieThresholdMinutes(job.type);

      if (minutesStuck >= threshold) {
        stuckJobs.push({ ...job, minutes_stuck: minutesStuck });
        if (minutesStuck >= threshold * 2) autoFailIds.push(job.id);
      }
    }

    let autoFailedCount = 0;
    if (autoFailIds.length > 0) {
      const { count } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: 'ZOMBIE_AUTO_FAILED: exceeded 2x zombie threshold without response',
          completed_at: new Date().toISOString(),
        })
        .in('id', autoFailIds)
        .eq('status', 'delivered');
      autoFailedCount = count || autoFailIds.length;
    }

    if (stuckJobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, stuck_jobs: 0, alerts_created: 0, auto_failed: autoFailedCount, timestamp: new Date().toISOString() }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const jobsByTenant: Record<string, StuckJob[]> = {};
    for (const job of stuckJobs) {
      if (!jobsByTenant[job.tenant_id]) jobsByTenant[job.tenant_id] = [];
      jobsByTenant[job.tenant_id].push(job);
    }

    let alertsCreated = 0;
    for (const [tenantId, jobs] of Object.entries(jobsByTenant)) {
      const maxMinutesStuck = Math.max(...jobs.map(j => j.minutes_stuck));
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (maxMinutesStuck >= 120) severity = 'critical';
      else if (maxMinutesStuck >= 60) severity = 'high';

      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId, alert_type: 'stuck_jobs', severity,
          message: `${jobs.length} job(s) travado(s) (thresholds adaptativos por tipo)`,
          metadata: {
            job_count: jobs.length, max_minutes_stuck: maxMinutesStuck,
            auto_failed: autoFailIds.filter(id => jobs.some(j => j.id === id)).length,
            jobs: jobs.slice(0, 10).map(j => ({ id: j.id, type: j.type, agent_name: j.agent_name, minutes_stuck: j.minutes_stuck, threshold: getZombieThresholdMinutes(j.type) })),
          },
        });
      if (!alertError) alertsCreated++;
    }

    const result = {
      success: true, stuck_jobs: stuckJobs.length, auto_failed: autoFailedCount,
      tenants_affected: Object.keys(jobsByTenant).length, alerts_created: alertsCreated,
      timestamp: new Date().toISOString(),
    };

    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-stuck-jobs', p_success: true,
      p_duration_ms: Date.now() - startedAt, p_result: result,
      p_processed_count: stuckJobs.length, p_job_source: 'cron',
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error(`[${requestId}] Fatal error:`, error);

    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-stuck-jobs', p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null, p_processed_count: 0, p_job_source: 'cron',
      });
    } catch (e) { logger.warn('[check-stuck-jobs] Failed to log job run:', e); }

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error', timestamp: new Date().toISOString() }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
