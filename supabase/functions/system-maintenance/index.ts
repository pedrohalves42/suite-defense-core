/**
 * system-maintenance - Consolidated cleanup function
 * 
 * Replaces 7 individual cleanup functions.
 * Auth: Internal only (service_role / X-Internal-Secret / cron)
 * 
 * Task implementations extracted to tasks.ts
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import {
  type TaskResult,
  cleanStaleUpdates,
  cleanStaleReports,
  cleanStalePlaybooks,
  cleanStuckBuilds,
  cleanStuckJobs,
  cleanOfflineAgentsJobs,
  securityCleanup,
} from './tasks.ts';

type TaskName =
  | 'stale_updates'
  | 'stale_reports'
  | 'stale_playbooks'
  | 'stuck_builds'
  | 'stuck_jobs'
  | 'offline_agents_jobs'
  | 'security_cleanup';

const ALL_TASKS: TaskName[] = [
  'stale_updates', 'stale_reports', 'stale_playbooks',
  'stuck_builds', 'stuck_jobs', 'offline_agents_jobs', 'security_cleanup',
];

const TASK_MAP: Record<TaskName, (sb: ReturnType<typeof createClient>) => Promise<TaskResult>> = {
  stale_updates: cleanStaleUpdates,
  stale_reports: cleanStaleReports,
  stale_playbooks: cleanStalePlaybooks,
  stuck_builds: cleanStuckBuilds,
  stuck_jobs: cleanStuckJobs,
  offline_agents_jobs: cleanOfflineAgentsJobs,
  security_cleanup: securityCleanup,
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
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
        // No body or invalid JSON -> run all tasks
      }
    }

    logger.info(`[system-maintenance][${requestId}] Running ${tasks.length} tasks: ${tasks.join(', ')}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const results: TaskResult[] = await Promise.all(
      tasks.map(async (task) => {
        const fn = TASK_MAP[task];
        if (!fn) return { task, processed: 0, cleaned: 0, errors: ['Unknown task'], duration_ms: 0 };
        const taskResult = await fn(supabase);
        logger.info(`[system-maintenance][${requestId}] ${task}: cleaned=${taskResult.cleaned} errors=${taskResult.errors.length}`);
        return taskResult;
      })
    );

    const totalCleaned = results.reduce((s, r) => s + r.cleaned, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'system-maintenance',
        p_status: totalErrors > 0 ? 'partial' : 'success',
        p_details: { results, duration_ms: Date.now() - startedAt },
      });
    } catch { /* Non-critical */ }

    return new Response(
      JSON.stringify({
        success: true, requestId,
        tasks_run: tasks.length,
        total_cleaned: totalCleaned,
        total_errors: totalErrors,
        results,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    logger.error(`[system-maintenance][${requestId}] Fatal:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: String(error), requestId }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }
});
