/**
 * CRON SENTINEL - ADR-FINAL
 * 
 * Runs every 10 minutes to detect cron jobs silent failures
 * and create P0 tasks when jobs are not executing.
 * 
 * This is the automatic trigger for the INC-CRON-001 Runbook.
 * 
 * IMPORTANT: Uses actual v_cron_silent_failures view columns:
 * id, tenant_id, job_name, cron_expression, last_run_at, next_run_at, status, enabled
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { recordMetric } from '../_shared/apm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

/**
 * Matches the ACTUAL columns of v_cron_silent_failures view.
 */
interface SilentJob {
  id: string;
  tenant_id: string | null;
  job_name: string;
  cron_expression: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  status: string | null;
  enabled: boolean | null;
}

/**
 * Derive health status from actual view data.
 * A job is unhealthy if:
 * - It has never run (last_run_at is null)
 * - It is enabled but status is not 'active'/'ok'
 * - Its next_run_at is in the past (overdue)
 */
function deriveHealthStatus(job: SilentJob): 'OK' | 'NEVER_RAN' | 'STALE' {
  if (!job.last_run_at) return 'NEVER_RAN';
  
  // If next_run_at is in the past by more than 10 minutes, it's stale
  if (job.next_run_at) {
    const nextRun = new Date(job.next_run_at).getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (nextRun < tenMinutesAgo) return 'STALE';
  }
  
  // If status indicates failure
  if (job.status && ['failed', 'error', 'stuck'].includes(job.status.toLowerCase())) {
    return 'STALE';
  }

  return 'OK';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[${requestId}] cron-sentinel started`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query the v_cron_silent_failures view
    const { data: silentJobs, error: queryError } = await supabase
      .from('v_cron_silent_failures')
      .select('*');

    if (queryError) {
      console.error(`[${requestId}] Error querying silent failures:`, queryError);
      throw queryError;
    }

    const allJobs = (silentJobs || []) as SilentJob[];

    // Derive health status from actual data and filter unhealthy
    const unhealthyJobs = allJobs
      .filter((job) => job.enabled !== false) // only check enabled jobs
      .filter((job) => deriveHealthStatus(job) !== 'OK');

    console.log(`[${requestId}] Checked ${allJobs.length} jobs, found ${unhealthyJobs.length} unhealthy`);

    if (unhealthyJobs.length === 0) {
      console.log(`[${requestId}] All cron jobs healthy - no action needed`);
      
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'cron-sentinel',
        p_success: true,
        p_duration_ms: Date.now() - startTime,
        p_result: { message: 'All jobs healthy', jobs_checked: allJobs.length },
        p_processed_count: 0,
        p_job_source: 'cron'
      });

      await supabase.rpc('update_cron_health', {
        p_cron_name: 'cron-sentinel',
        p_success: true,
        p_error: null
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'All cron jobs healthy',
          jobs_checked: allJobs.length,
          silent_jobs: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing open task to avoid spam
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('source_type', 'system_alert')
      .like('title', '%Cron Jobs Silent Failure%')
      .in('status', ['open', 'in_progress'])
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (existingTask && existingTask.length > 0) {
      console.log(`[${requestId}] Open task already exists, skipping creation`);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Alert task already exists',
          existing_task_id: existingTask[0].id,
          silent_jobs: unhealthyJobs.length
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get runbook for reference
    const { data: runbook } = await supabase
      .from('runbooks')
      .select('id, title, steps')
      .eq('anomaly_type', 'cron_silent_failure')
      .single();

    // Create P0 task with runbook reference
    const jobNames = unhealthyJobs.map((j) => j.job_name).slice(0, 10).join(', ');
    const moreCount = unhealthyJobs.length > 10 ? ` (+${unhealthyJobs.length - 10} more)` : '';

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        tenant_id: unhealthyJobs[0]?.tenant_id || null,
        source_type: 'system_alert',
        title: `🚨 Cron Jobs Silent Failure - ${unhealthyJobs.length} jobs`,
        description: `Jobs sem execução detectados: ${jobNames}${moreCount}. Consulte o Runbook INC-CRON-001 para resolução.`,
        severity: 'critical',
        status: 'open',
        auto_generated: true,
        metadata: {
          silent_jobs: unhealthyJobs.map((j) => ({
            name: j.job_name,
            status: deriveHealthStatus(j),
            last_run_at: j.last_run_at,
            next_run_at: j.next_run_at,
            cron_expression: j.cron_expression,
          })),
          runbook_id: runbook?.id || null,
          runbook_title: runbook?.title || 'INC-CRON-001',
          detected_at: new Date().toISOString(),
          sentinel_run_id: requestId
        }
      })
      .select('id')
      .single();

    if (taskError) {
      console.error(`[${requestId}] Error creating task:`, taskError);
      throw taskError;
    }

    console.log(`[${requestId}] Created P0 task: ${task?.id}`);

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: 'CRON_SILENT_FAILURE_DETECTED',
      resource_type: 'scheduled_jobs',
      details: {
        silent_jobs_count: unhealthyJobs.length,
        task_id: task?.id,
        sentinel_run: requestId,
        jobs: unhealthyJobs.map((j) => j.job_name)
      },
      severity: 'critical'
    });

    // Log successful sentinel run
    const duration = Date.now() - startTime;
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'cron-sentinel',
      p_success: true,
      p_duration_ms: duration,
      p_result: {
        silent_jobs: unhealthyJobs.length,
        task_created: task?.id,
        jobs: unhealthyJobs.map((j) => j.job_name)
      },
      p_processed_count: unhealthyJobs.length,
      p_job_source: 'cron'
    });

    await supabase.rpc('update_cron_health', {
      p_cron_name: 'cron-sentinel',
      p_success: true,
      p_error: null
    });

    recordMetric({
      function_name: 'cron-sentinel',
      operation_type: 'edge_function',
      duration_ms: duration,
      status_code: 200,
      metadata: { silent_jobs: unhealthyJobs.length, task_id: task?.id }
    }).catch((e) => console.warn('[cron-sentinel] APM metric failed:', e));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Alert created for silent cron jobs',
        task_id: task?.id,
        silent_jobs: unhealthyJobs.length,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Fatal error:`, error);

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'cron-sentinel',
        p_success: false,
        p_duration_ms: duration,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });

      await supabase.rpc('update_cron_health', {
        p_cron_name: 'cron-sentinel',
        p_success: false,
        p_error: error instanceof Error ? error.message : 'Unknown error'
      });
    } catch (e) { console.warn('[cron-sentinel] Failed to update cron health:', e); }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
