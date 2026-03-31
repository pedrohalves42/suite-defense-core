/**
 * process-scheduled-jobs → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const JOB_TTL_HOURS: Record<string, number> = {
  collect_antivirus_status: 1, software_inventory_collect: 1, collect_web_activity: 1,
  light_vuln_scan: 1, collect_network_info: 1, collect_certificates: 1,
  collect_disk_metrics: 1, service_health_check: 1, network_diagnostics: 1,
};
const getTtlForType = (type: string): number => JOB_TTL_HOURS[type] ?? 4;

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  logger.info(`[${requestId}] Processing scheduled jobs`);

  const now = new Date().toISOString();
  let processedCount = 0;
  let createdRecurringCount = 0;

  // 1. Process one-time scheduled jobs that are due
  const { data: scheduledJobs, error: scheduledError } = await supabase
    .from('jobs')
    .select(`*, agent:agents!jobs_agent_id_fkey(id, last_heartbeat, status, scheduling_paused)`)
    .eq('status', 'queued').eq('is_recurring', false)
    .not('scheduled_at', 'is', null).lte('scheduled_at', now).limit(100);

  if (scheduledError) { logger.error(`[${requestId}] Error fetching scheduled jobs:`, scheduledError); throw scheduledError; }
  logger.info(`[${requestId}] Found ${scheduledJobs?.length || 0} one-time scheduled jobs to process`);

  let skippedOneTimeOffline = 0;
  if (scheduledJobs && scheduledJobs.length > 0) {
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const onlineJobIds: string[] = [];
    const offlineJobIds: string[] = [];

    for (const job of scheduledJobs) {
      const agent = job.agent;
      const isOnline = agent && agent.status === 'active' && !agent.scheduling_paused && agent.last_heartbeat && new Date(agent.last_heartbeat) > onlineThreshold;
      if (isOnline) { onlineJobIds.push(job.id); }
      else { offlineJobIds.push(job.id); skippedOneTimeOffline++; }
    }

    if (onlineJobIds.length > 0) {
      const { error: updateError } = await supabase.from('jobs').update({ status: 'queued', scheduled_at: null }).in('id', onlineJobIds);
      if (!updateError) { processedCount = onlineJobIds.length; logger.info(`[${requestId}] Activated ${processedCount} scheduled jobs`); }
    }

    if (offlineJobIds.length > 0) {
      await supabase.from('jobs').update({ status: 'failed', error_message: '[DLQ:AGENT_OFFLINE] Scheduled job skipped: agent offline at execution time', completed_at: now }).in('id', offlineJobIds).lt('expires_at', now);
    }
  }

  // 2. Process recurring jobs
  const { data: recurringJobs, error: recurringError } = await supabase
    .from('jobs')
    .select(`*, agent:agents!jobs_agent_id_fkey(id, last_heartbeat, status, scheduling_paused)`)
    .eq('is_recurring', true).eq('approved', true)
    .not('next_run_at', 'is', null).lte('next_run_at', now).limit(50);

  if (recurringError) { logger.error(`[${requestId}] Error fetching recurring jobs:`, recurringError); throw recurringError; }
  logger.info(`[${requestId}] Found ${recurringJobs?.length || 0} recurring jobs to process`);

  let skippedOfflineCount = 0;
  if (recurringJobs && recurringJobs.length > 0) {
    for (const recurringJob of recurringJobs) {
      try {
        const agent = recurringJob.agent;
        const isOnline = agent && agent.status === 'active' && !agent.scheduling_paused && agent.last_heartbeat && new Date(agent.last_heartbeat) > new Date(Date.now() - 2 * 60 * 60 * 1000);

        if (!isOnline) {
          skippedOfflineCount++;
          const { data: nextRunData } = await supabase.rpc('calculate_next_run', { pattern: recurringJob.recurrence_pattern, from_time: now });
          if (nextRunData) { await supabase.from('jobs').update({ next_run_at: nextRunData }).eq('id', recurringJob.id); }
          continue;
        }

        const { data: nextRunData, error: nextRunError } = await supabase.rpc('calculate_next_run', { pattern: recurringJob.recurrence_pattern, from_time: now });
        if (nextRunError) { logger.error(`[${requestId}] Error calculating next run for job ${recurringJob.id}:`, nextRunError); continue; }

        const { error: insertError } = await supabase.rpc('create_job_if_not_exists', {
          p_agent_id: recurringJob.agent_id, p_tenant_id: recurringJob.tenant_id,
          p_type: recurringJob.type, p_payload: recurringJob.payload || {},
          p_priority: recurringJob.priority || 5, p_ttl_hours: getTtlForType(recurringJob.type)
        });
        if (insertError) { logger.error(`[${requestId}] Error creating job instance for ${recurringJob.id}:`, insertError); continue; }

        await supabase.from('jobs').update({ last_run_at: now, next_run_at: nextRunData }).eq('id', recurringJob.id);
        createdRecurringCount++;
      } catch (error) { logger.error(`[${requestId}] Error processing recurring job ${recurringJob.id}:`, error); }
    }
  }

  const result = {
    success: true, processedScheduled: processedCount, createdRecurring: createdRecurringCount,
    skippedOffline: skippedOfflineCount + skippedOneTimeOffline,
    skippedRecurringOffline: skippedOfflineCount, skippedScheduledOffline: skippedOneTimeOffline, timestamp: now
  };
  logger.info(`[${requestId}] Completed:`, result);

  const duration = Date.now() - new Date(now).getTime();
  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'process-scheduled-jobs', p_success: true,
      p_duration_ms: duration > 0 ? duration : 1, p_result: result,
      p_processed_count: processedCount + createdRecurringCount, p_job_source: 'cron'
    });
  } catch (logErr) { logger.error(`[${requestId}] Failed to log cron health:`, logErr); }

  return result;
});
