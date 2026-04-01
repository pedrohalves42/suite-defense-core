/**
 * invoke-scheduled-jobs → Migrated to serveInternal middleware
 * Invoca todos os scheduled_jobs que estao habilitados e no horario de execucao.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();
  logger.info(`[${requestId}] invoke-scheduled-jobs started`);

  // KILL SWITCH CHECK (ADR-FINAL)
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    logger.info(`[${requestId}] SYSTEM_HALTED: Kill switch active, skipping all jobs`);
    return new Response(
      JSON.stringify({ success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const now = new Date();
  const results: Array<{ name: string; job_type: string; status: 'executed' | 'skipped' | 'error'; message?: string }> = [];

  const { data: scheduledJobs, error: fetchError } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .eq('enabled', true);

  if (fetchError) {
    logger.error(`[${requestId}] Error fetching scheduled jobs:`, fetchError);
    throw fetchError;
  }

  logger.info(`[${requestId}] Found ${scheduledJobs?.length || 0} enabled scheduled jobs`);

  const jobTypeToFunction: Record<string, string> = {
    'edge_function': '',
    'autonomous_safe_mode': 'autonomous-safe-mode',
    'auto_cleanup': 'cleanup-router',
    'auto_execute_ai': 'auto-execute-ai-actions',
    'watchdog_non_execution': 'watchdog-non-execution',
    'ai_system_analyzer': 'ai-system-analyzer',
    'integrity_sentinel': 'integrity-sentinel',
    'scheduled_reports': 'scheduled-report-generator',
    'executive_report': 'generate-executive-report',
    'detect_blocked_attempts': 'detect-blocked-attempts',
    'ai_insight_generator': 'ai-router',
    'scan_vulnerabilities': 'scan-vulnerabilities',
    'monitor_thresholds': 'monitor-thresholds',
    'cron_sentinel': 'cron-sentinel',
    'ai-full-audit': 'ai-full-audit',
    'ai-red-team-assessment': 'ai-red-team-assessment',
    'generate-weekly-report': 'generate-weekly-report',
  };

  const nameToFunction: Record<string, string> = {
    'Autonomous SAFE_MODE': 'autonomous-safe-mode',
    'Auto Cleanup Jobs': 'cleanup-router',
    'Auto Execute AI Actions': 'auto-execute-ai-actions',
    'Watchdog Non-Execution': 'watchdog-non-execution',
    'AI System Analyzer': 'ai-system-analyzer',
    'Integrity Sentinel': 'integrity-sentinel',
    'Scheduled Report Generator': 'scheduled-report-generator',
    'Executive Report': 'generate-executive-report',
    'Detect Blocked Attempts': 'detect-blocked-attempts',
    'AI Insight Generator': 'ai-router',
  };

  for (const job of scheduledJobs || []) {
    try {
      let functionName = jobTypeToFunction[job.job_type];
      if (!functionName && job.job_type === 'edge_function') {
        functionName = nameToFunction[job.name] || '';
      }

      if (!functionName) {
        logger.info(`[${requestId}] No function mapping for job: ${job.name} (type: ${job.job_type})`);
        results.push({ name: job.name, job_type: job.job_type, status: 'skipped', message: 'No function mapping' });
        continue;
      }

      if (job.next_run_at && new Date(job.next_run_at) > now) {
        logger.info(`[${requestId}] Job ${job.name} not due yet (next_run_at: ${job.next_run_at})`);
        results.push({ name: job.name, job_type: job.job_type, status: 'skipped', message: `Not due until ${job.next_run_at}` });
        continue;
      }

      logger.info(`[${requestId}] Invoking function: ${functionName} for job: ${job.name}`);

      const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      const basePayload = { scheduled_job_id: job.id, tenant_id: job.tenant_id, triggered_by: 'scheduled' };

      // Route ai-router calls with proper action envelope
      const isAiRouter = functionName === 'ai-router';
      const aiActionMap: Record<string, string> = { 'ai_insight_generator': 'get-insights', 'AI Insight Generator': 'get-insights' };
      const invokeBody = isAiRouter
        ? { action: aiActionMap[job.job_type] || aiActionMap[job.name] || 'get-insights', payload: basePayload }
        : basePayload;

      const { error: invokeError } = await supabase.functions.invoke(functionName, {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET || '' },
        body: invokeBody,
      });

      if (invokeError) {
        logger.error(`[${requestId}] Error invoking ${functionName}:`, invokeError);
        results.push({ name: job.name, job_type: job.job_type, status: 'error', message: invokeError.message });
        continue;
      }

      const nextRunAt = calculateNextRun(job.cron_expr, now);
      await supabase.from('scheduled_jobs').update({
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt?.toISOString() || null
      }).eq('id', job.id);

      logger.info(`[${requestId}] Successfully executed job: ${job.name}`);
      results.push({ name: job.name, job_type: job.job_type, status: 'executed', message: 'Success' });
    } catch (jobError) {
      logger.error(`[${requestId}] Error processing job ${job.name}:`, jobError);
      results.push({ name: job.name, job_type: job.job_type, status: 'error', message: jobError instanceof Error ? jobError.message : 'Unknown error' });
    }
  }

  const durationMs = Date.now() - startedAt;
  const summary = {
    success: true,
    total_jobs: scheduledJobs?.length || 0,
    executed: results.filter(r => r.status === 'executed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
    timestamp: now.toISOString(),
    duration_ms: durationMs
  };

  logger.info(`[${requestId}] Completed:`, summary);

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'invoke-scheduled-jobs', p_success: true, p_duration_ms: durationMs,
      p_result: { total_jobs: summary.total_jobs, executed: summary.executed, skipped: summary.skipped, errors: summary.errors },
      p_processed_count: summary.executed, p_job_source: 'cron'
    });
  } catch (logErr) { logger.error(`[${requestId}] Failed to log job run:`, logErr); }

  return summary;
});

function calculateNextRun(cronExpr: string, from: Date): Date | null {
  try {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return null;
    const [minute, hour] = parts;
    const next = new Date(from);

    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10);
      const currentMinute = next.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
      if (nextMinute >= 60) { next.setHours(next.getHours() + 1); next.setMinutes(nextMinute - 60); }
      else { next.setMinutes(nextMinute); }
      next.setSeconds(0); next.setMilliseconds(0);
      return next;
    }

    if (minute !== '*' && hour.startsWith('*/')) {
      const hourInterval = parseInt(hour.slice(2), 10);
      const targetMinute = parseInt(minute, 10);
      next.setMinutes(targetMinute); next.setSeconds(0); next.setMilliseconds(0);
      if (next <= from) {
        const currentHour = next.getHours();
        const nextHour = Math.ceil((currentHour + 1) / hourInterval) * hourInterval;
        if (nextHour >= 24) { next.setDate(next.getDate() + 1); next.setHours(nextHour - 24); }
        else { next.setHours(nextHour); }
      }
      return next;
    }

    if (!minute.includes('*') && !hour.includes('*')) {
      next.setHours(parseInt(hour, 10)); next.setMinutes(parseInt(minute, 10));
      next.setSeconds(0); next.setMilliseconds(0);
      if (next <= from) { next.setDate(next.getDate() + 1); }
      return next;
    }

    next.setHours(next.getHours() + 1); next.setMinutes(0); next.setSeconds(0); next.setMilliseconds(0);
    return next;
  } catch (err) { logger.warn('[invoke-scheduled-jobs] getNextRunDate failed', err); return null; }
}
