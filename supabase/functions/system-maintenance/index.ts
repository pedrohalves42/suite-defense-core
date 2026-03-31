/**
 * system-maintenance - Consolidated cleanup function
 * Replaces 7 individual cleanup functions.
 * Migrated to serveInternal middleware
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
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

const TASK_MAP: Record<TaskName, (sb: SupabaseClient) => Promise<TaskResult>> = {
  stale_updates: cleanStaleUpdates,
  stale_reports: cleanStaleReports,
  stale_playbooks: cleanStalePlaybooks,
  stuck_builds: cleanStuckBuilds,
  stuck_jobs: cleanStuckJobs,
  offline_agents_jobs: cleanOfflineAgentsJobs,
  security_cleanup: securityCleanup,
};

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const startedAt = Date.now();

  let tasks: TaskName[] = ALL_TASKS;
  const parsedBody = body as Record<string, unknown> | null;
  if (parsedBody?.tasks && Array.isArray(parsedBody.tasks) && parsedBody.tasks.length > 0) {
    tasks = (parsedBody.tasks as string[]).filter((t) => ALL_TASKS.includes(t as TaskName)) as TaskName[];
  }

  logger.info(`[system-maintenance][${requestId}] Running ${tasks.length} tasks: ${tasks.join(', ')}`);

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
  } catch (err) { logger.warn('[system-maintenance] log_scheduled_job_run failed', err); }

  return {
    success: true, requestId,
    tasks_run: tasks.length,
    total_cleaned: totalCleaned,
    total_errors: totalErrors,
    results,
    duration_ms: Date.now() - startedAt,
  };
});
