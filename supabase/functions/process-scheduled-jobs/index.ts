import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

/**
 * Adaptive TTL per job type.
 * Collection jobs use shorter TTL (1h) because stale data is useless.
 * Update/recovery jobs keep 4h to give agents time to come online.
 */
const JOB_TTL_HOURS: Record<string, number> = {
  collect_antivirus_status: 1,
  software_inventory_collect: 1,
  collect_web_activity: 1,
  light_vuln_scan: 1,
  collect_network_info: 1,
  collect_certificates: 1,
  collect_disk_metrics: 1,
  service_health_check: 1,
  network_diagnostics: 1,
  // Everything else defaults to 4h
};

const getTtlForType = (type: string): number => JOB_TTL_HOURS[type] ?? 4;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1105: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] Processing scheduled jobs`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    let processedCount = 0;
    let createdRecurringCount = 0;

    // 1. Process one-time scheduled jobs that are due
    // Join with agents to check online status
    const { data: scheduledJobs, error: scheduledError } = await supabase
      .from('jobs')
      .select(`
        *,
        agent:agents!jobs_agent_id_fkey(id, last_heartbeat, status, scheduling_paused)
      `)
      .eq('status', 'queued')
      .eq('is_recurring', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)
      .limit(100);

    if (scheduledError) {
      logger.error(`[${requestId}] Error fetching scheduled jobs:`, scheduledError);
      throw scheduledError;
    }

    logger.info(`[${requestId}] Found ${scheduledJobs?.length || 0} one-time scheduled jobs to process`);

    // Filter: only activate jobs for online agents (heartbeat within 2 hours)
    let skippedOneTimeOffline = 0;
    if (scheduledJobs && scheduledJobs.length > 0) {
      const onlineThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const onlineJobIds: string[] = [];
      const offlineJobIds: string[] = [];

      for (const job of scheduledJobs) {
        const agent = job.agent;
        const isOnline = agent &&
          agent.status === 'active' &&
          !agent.scheduling_paused &&
          agent.last_heartbeat &&
          new Date(agent.last_heartbeat) > onlineThreshold;

        if (isOnline) {
          onlineJobIds.push(job.id);
        } else {
          offlineJobIds.push(job.id);
          skippedOneTimeOffline++;
          logger.info(`[${requestId}] Skipping scheduled job ${job.id} - agent ${job.agent_name} offline`);
        }
      }

      // Activate jobs for online agents
      if (onlineJobIds.length > 0) {
        const { error: updateError } = await supabase
          .from('jobs')
          .update({ 
            status: 'queued',
            scheduled_at: null
          })
          .in('id', onlineJobIds);

        if (updateError) {
          logger.error(`[${requestId}] Error updating scheduled jobs:`, updateError);
        } else {
          processedCount = onlineJobIds.length;
          logger.info(`[${requestId}] Activated ${processedCount} scheduled jobs`);
        }
      }

      // Fail jobs for offline agents that have expired TTL
      if (offlineJobIds.length > 0) {
        const { error: failError } = await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: '[DLQ:AGENT_OFFLINE] Scheduled job skipped: agent offline at execution time',
            completed_at: now,
          })
          .in('id', offlineJobIds)
          .lt('expires_at', now);

        if (failError) {
          logger.error(`[${requestId}] Error failing expired offline jobs:`, failError);
        }
      }
    }

    // 2. Process recurring jobs that are due
    // Join with agents to check if agent is online (heartbeat within last 2 hours)
    const { data: recurringJobs, error: recurringError } = await supabase
      .from('jobs')
      .select(`
        *,
        agent:agents!jobs_agent_id_fkey(id, last_heartbeat, status, scheduling_paused)
      `)
      .eq('is_recurring', true)
      .eq('approved', true)
      .not('next_run_at', 'is', null)
      .lte('next_run_at', now)
      .limit(50);

    if (recurringError) {
      logger.error(`[${requestId}] Error fetching recurring jobs:`, recurringError);
      throw recurringError;
    }

    logger.info(`[${requestId}] Found ${recurringJobs?.length || 0} recurring jobs to process`);

    let skippedOfflineCount = 0;
    
    if (recurringJobs && recurringJobs.length > 0) {
      for (const recurringJob of recurringJobs) {
        try {
          // IMPROVEMENT: Skip jobs for offline agents
          const agent = recurringJob.agent;
          const isOnline = agent && 
            agent.status === 'active' && 
            !agent.scheduling_paused &&
            agent.last_heartbeat && 
            new Date(agent.last_heartbeat) > new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours
          
          if (!isOnline) {
            skippedOfflineCount++;
            logger.info(`[${requestId}] Skipping recurring job ${recurringJob.id} - agent offline:`, {
              agent_name: recurringJob.agent_name,
              last_heartbeat: agent?.last_heartbeat || 'never',
              status: agent?.status || 'unknown'
            });
            
            // Still update next_run_at to avoid infinite retries
            const { data: nextRunData } = await supabase.rpc('calculate_next_run', { 
              pattern: recurringJob.recurrence_pattern,
              from_time: now
            });
            
            if (nextRunData) {
              await supabase.from('jobs').update({ next_run_at: nextRunData }).eq('id', recurringJob.id);
            }
            continue;
          }

          // Calculate next run time
          const { data: nextRunData, error: nextRunError } = await supabase
            .rpc('calculate_next_run', { 
              pattern: recurringJob.recurrence_pattern,
              from_time: now
            });

          if (nextRunError) {
            logger.error(`[${requestId}] Error calculating next run for job ${recurringJob.id}:`, nextRunError);
            continue;
          }

          // Create a new job instance with dedup guard (prevents idx_jobs_dedup_active violations)
          const { data: newJobId, error: insertError } = await supabase
            .rpc('create_job_if_not_exists', {
              p_agent_id: recurringJob.agent_id,
              p_tenant_id: recurringJob.tenant_id,
              p_type: recurringJob.type,
              p_payload: recurringJob.payload || {},
              p_priority: recurringJob.priority || 5,
              p_ttl_hours: getTtlForType(recurringJob.type)
            });

          if (insertError) {
            logger.error(`[${requestId}] Error creating job instance for ${recurringJob.id}:`, insertError);
            continue;
          }

          if (!newJobId) {
            logger.info(`[${requestId}] Skipping recurring job ${recurringJob.id} - active job of type '${recurringJob.type}' already exists for agent ${recurringJob.agent_name}`);
            // Still update next_run_at below
          }

          // Update the recurring job with new next_run_at and last_run_at
          const { error: updateRecurringError } = await supabase
            .from('jobs')
            .update({
              last_run_at: now,
              next_run_at: nextRunData
            })
            .eq('id', recurringJob.id);

          if (updateRecurringError) {
            logger.error(`[${requestId}] Error updating recurring job ${recurringJob.id}:`, updateRecurringError);
            continue;
          }

          createdRecurringCount++;
          logger.info(`[${requestId}] Created instance of recurring job ${recurringJob.id}, next run at ${nextRunData}`);
        } catch (error) {
          logger.error(`[${requestId}] Error processing recurring job ${recurringJob.id}:`, error);
        }
      }
    }
    
    logger.info(`[${requestId}] Skipped ${skippedOfflineCount} jobs for offline agents`);

    const result = {
      success: true,
      processedScheduled: processedCount,
      createdRecurring: createdRecurringCount,
      skippedOffline: skippedOfflineCount + skippedOneTimeOffline,
      skippedRecurringOffline: skippedOfflineCount,
      skippedScheduledOffline: skippedOneTimeOffline,
      timestamp: now
    };

    logger.info(`[${requestId}] Completed:`, result);

    // Report to cron health
    const duration = Date.now() - new Date(now).getTime();
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'process-scheduled-jobs',
        p_success: true,
        p_duration_ms: duration > 0 ? duration : 1,
        p_result: result,
        p_processed_count: processedCount + createdRecurringCount,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.error(`[${requestId}] Failed to log cron health:`, logErr);
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    logger.error(`[${requestId}] Fatal error:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      }
    );
  }
});
