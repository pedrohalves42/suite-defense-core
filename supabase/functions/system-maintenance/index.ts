import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * system-maintenance — Consolidated cleanup function
 * 
 * Replaces 7 individual cleanup functions:
 *   cleanup-stale-updates, cleanup-stale-reports, cleanup-stale-playbooks,
 *   cleanup-stuck-builds, cleanup-stuck-jobs, cleanup-offline-agents-jobs,
 *   security-cleanup-cron
 * 
 * Usage:
 *   POST /functions/v1/system-maintenance
 *   Body: { "tasks": ["stale_updates", "stale_reports", ...] }
 *   - If no tasks specified, runs ALL cleanup tasks.
 *   
 * Auth: Internal only (service_role / X-Internal-Secret / cron)
 */

type TaskName =
  | 'stale_updates'
  | 'stale_reports'
  | 'stale_playbooks'
  | 'stuck_builds'
  | 'stuck_jobs'
  | 'offline_agents_jobs'
  | 'security_cleanup';

const ALL_TASKS: TaskName[] = [
  'stale_updates',
  'stale_reports',
  'stale_playbooks',
  'stuck_builds',
  'stuck_jobs',
  'offline_agents_jobs',
  'security_cleanup',
];

interface TaskResult {
  task: string;
  processed: number;
  cleaned: number;
  errors: string[];
  duration_ms: number;
}

// ─── Task Implementations ────────────────────────────────────────────────────

async function cleanStaleUpdates(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stale_updates', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    const MAX_DELIVERY_COUNT = 10;
    const MAX_STALE_HOURS = 168;
    const threshold = new Date(Date.now() - MAX_STALE_HOURS * 3600 * 1000).toISOString();

    // Stale by time
    const { data: byTime } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id')
      .not('force_update_version', 'is', null)
      .lt('force_update_at', threshold);

    // Stale by delivery count
    const { data: byCount } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id')
      .not('force_update_version', 'is', null)
      .gte('force_update_delivery_count', MAX_DELIVERY_COUNT);

    const allIds = new Set([
      ...(byTime || []).map((a: any) => a.id),
      ...(byCount || []).map((a: any) => a.id),
    ]);

    result.processed = allIds.size;

    if (allIds.size > 0) {
      const { error } = await supabase
        .from('agents')
        .update({
          force_update_version: null,
          force_update_at: null,
          force_update_reason: null,
          force_update_delivery_count: 0,
        })
        .in('id', Array.from(allIds));

      if (error) result.errors.push(error.message);
      else result.cleaned = allIds.size;
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function cleanStaleReports(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stale_reports', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { data, error } = await supabase
      .from('security_reports')
      .select('id')
      .in('status', ['pending', 'processing', 'generated'])
      .lt('created_at', cutoff);

    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: any) => r.id);

      const { error: updateErr } = await supabase
        .from('security_reports')
        .update({ status: 'failed', error_message: 'Stale report cleaned by system-maintenance' })
        .in('id', ids);

      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function cleanStalePlaybooks(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stale_playbooks', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('playbook_executions')
      .select('id')
      .in('status', ['pending', 'in_progress'])
      .lt('started_at', cutoff);

    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: any) => r.id);

      const { error: updateErr } = await supabase
        .from('playbook_executions')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .in('id', ids);

      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function cleanStuckBuilds(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stuck_builds', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('agent_builds')
      .select('id')
      .in('build_status', ['pending', 'building', 'in_progress'])
      .lt('created_at', cutoff);

    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: any) => r.id);

      const { error: updateErr } = await supabase
        .from('agent_builds')
        .update({ build_status: 'failed', error_message: 'Build timed out — cleaned by system-maintenance' })
        .in('id', ids);

      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function cleanStuckJobs(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stuck_jobs', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    // Jobs with TTL expired (4h default)
    const cutoff = new Date(Date.now() - 4 * 3600 * 1000).toISOString();

    const { data, error } = await supabase
      .from('jobs')
      .select('id')
      .in('status', ['pending', 'queued', 'delivered', 'running'])
      .lt('created_at', cutoff);

    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: any) => r.id);

      const { error: updateErr } = await supabase
        .from('jobs')
        .update({ status: 'expired' })
        .in('id', ids);

      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function cleanOfflineAgentsJobs(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'offline_agents_jobs', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    // Cancel pending jobs for agents offline > 2h
    const offlineThreshold = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const { data: offlineAgents } = await supabase
      .from('agents')
      .select('id')
      .lt('last_seen', offlineThreshold);

    if (offlineAgents && offlineAgents.length > 0) {
      const agentIds = offlineAgents.map((a: any) => a.id);

      const { data: pendingJobs, error } = await supabase
        .from('jobs')
        .select('id')
        .in('agent_id', agentIds)
        .in('status', ['pending', 'queued']);

      if (error) { result.errors.push(error.message); }
      else if (pendingJobs && pendingJobs.length > 0) {
        result.processed = pendingJobs.length;
        const ids = pendingJobs.map((j: any) => j.id);

        const { error: updateErr } = await supabase
          .from('jobs')
          .update({ status: 'cancelled' })
          .in('id', ids);

        if (updateErr) result.errors.push(updateErr.message);
        else result.cleaned = ids.length;
      }
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function securityCleanup(supabase: ReturnType<typeof createClient>): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'security_cleanup', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };

  try {
    // Clean expired sessions
    const { data, error } = await supabase
      .from('active_sessions')
      .select('id')
      .lt('expires_at', new Date().toISOString());

    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;

      const { error: delErr } = await supabase
        .from('active_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (delErr) result.errors.push(delErr.message);
      else result.cleaned = data.length;
    }
  } catch (e) {
    result.errors.push(String(e));
  }

  result.duration_ms = Date.now() - start;
  return result;
}

const TASK_MAP: Record<TaskName, (sb: ReturnType<typeof createClient>) => Promise<TaskResult>> = {
  stale_updates: cleanStaleUpdates,
  stale_reports: cleanStaleReports,
  stale_playbooks: cleanStalePlaybooks,
  stuck_builds: cleanStuckBuilds,
  stuck_jobs: cleanStuckJobs,
  offline_agents_jobs: cleanOfflineAgentsJobs,
  security_cleanup: securityCleanup,
};

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    let tasks: TaskName[] = ALL_TASKS;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.tasks && Array.isArray(body.tasks) && body.tasks.length > 0) {
          tasks = body.tasks.filter((t: string) => ALL_TASKS.includes(t as TaskName)) as TaskName[];
        }
      } catch {
        // No body or invalid JSON — run all tasks
      }
    }

    console.log(`[system-maintenance][${requestId}] Running ${tasks.length} tasks: ${tasks.join(', ')}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // P-13008 FIX: Run independent tasks in parallel instead of sequential
    const results: TaskResult[] = await Promise.all(
      tasks.map(async (task) => {
        const fn = TASK_MAP[task];
        if (!fn) return { task, processed: 0, cleaned: 0, errors: ['Unknown task'], duration_ms: 0 };
        const taskResult = await fn(supabase);
        console.log(`[system-maintenance][${requestId}] ${task}: cleaned=${taskResult.cleaned} errors=${taskResult.errors.length}`);
        return taskResult;
      })
    );

    const totalCleaned = results.reduce((s, r) => s + r.cleaned, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    // Log observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'system-maintenance',
        p_status: totalErrors > 0 ? 'partial' : 'success',
        p_details: { results, duration_ms: Date.now() - startedAt },
      });
    } catch {
      // Non-critical
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        tasks_run: tasks.length,
        total_cleaned: totalCleaned,
        total_errors: totalErrors,
        results,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error(`[system-maintenance][${requestId}] Fatal:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: String(error), requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
