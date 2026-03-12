import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * Invoca todos os scheduled_jobs que estão habilitados e no horário de execução.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1110: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  console.log(`[${requestId}] invoke-scheduled-jobs started`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // KILL SWITCH CHECK (ADR-FINAL) - Halt all automation if system is in halt_jobs mode
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') {
      console.log(`[${requestId}] SYSTEM_HALTED: Kill switch active, skipping all jobs`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SYSTEM_HALTED', 
          message: 'Kill switch is active. Set system_state.mode to normal to resume.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const results: Array<{
      name: string;
      job_type: string;
      status: 'executed' | 'skipped' | 'error';
      message?: string;
    }> = [];

    // Fetch all enabled scheduled jobs
    const { data: scheduledJobs, error: fetchError } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('enabled', true);

    if (fetchError) {
      console.error(`[${requestId}] Error fetching scheduled jobs:`, fetchError);
      throw fetchError;
    }

    console.log(`[${requestId}] Found ${scheduledJobs?.length || 0} enabled scheduled jobs`);

    // Map of job_type to edge function name
    const jobTypeToFunction: Record<string, string> = {
      'edge_function': '', // Generic - uses name mapping below
      'autonomous_safe_mode': 'autonomous-safe-mode',
      'auto_cleanup': 'auto-cleanup-jobs',
      'auto_execute_ai': 'auto-execute-ai-actions',
      'watchdog_non_execution': 'watchdog-non-execution',
      'ai_system_analyzer': 'ai-system-analyzer',
      'integrity_sentinel': 'integrity-sentinel',
      'scheduled_reports': 'scheduled-report-generator',
      'executive_report': 'generate-executive-report',
      'detect_blocked_attempts': 'detect-blocked-attempts',
      'ai_insight_generator': 'ai-get-insights',
      'scan_vulnerabilities': 'scan-vulnerabilities',
      'monitor_thresholds': 'monitor-thresholds',
      'cron_sentinel': 'cron-sentinel',
      // FASE 8: Adicionar mapeamentos faltantes (CRITICAL)
      'ai-full-audit': 'ai-full-audit',
      'ai-red-team-assessment': 'ai-red-team-assessment',
      'generate-weekly-report': 'generate-weekly-report',
    };

    // Name-based mapping for edge_function type jobs
    const nameToFunction: Record<string, string> = {
      'Autonomous SAFE_MODE': 'autonomous-safe-mode',
      'Auto Cleanup Jobs': 'auto-cleanup-jobs',
      'Auto Execute AI Actions': 'auto-execute-ai-actions',
      'Watchdog Non-Execution': 'watchdog-non-execution',
      'AI System Analyzer': 'ai-system-analyzer',
      'Integrity Sentinel': 'integrity-sentinel',
      'Scheduled Report Generator': 'scheduled-report-generator',
      'Executive Report': 'generate-executive-report',
      'Detect Blocked Attempts': 'detect-blocked-attempts',
      'AI Insight Generator': 'ai-get-insights',
    };

    // Parse cron expression to check if job should run
    const shouldRunNow = (cronExpr: string, lastRunAt: string | null): boolean => {
      // For simplicity, check if next_run_at is in the past or null
      // More advanced: use cron parser library
      // For now, always run if enabled (let the function be idempotent)
      return true;
    };

    for (const job of scheduledJobs || []) {
      try {
        // Determine which function to call
        let functionName = jobTypeToFunction[job.job_type];
        if (!functionName && job.job_type === 'edge_function') {
          functionName = nameToFunction[job.name] || '';
        }

        if (!functionName) {
          console.log(`[${requestId}] No function mapping for job: ${job.name} (type: ${job.job_type})`);
          results.push({
            name: job.name,
            job_type: job.job_type,
            status: 'skipped',
            message: 'No function mapping'
          });
          continue;
        }

        // Check if should run based on next_run_at
        if (job.next_run_at && new Date(job.next_run_at) > now) {
          console.log(`[${requestId}] Job ${job.name} not due yet (next_run_at: ${job.next_run_at})`);
          results.push({
            name: job.name,
            job_type: job.job_type,
            status: 'skipped',
            message: `Not due until ${job.next_run_at}`
          });
          continue;
        }

        console.log(`[${requestId}] Invoking function: ${functionName} for job: ${job.name}`);

        // Get internal secret to pass to child functions (ADR-023 compliant)
        const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

        // Invoke the edge function with auth headers
        const { data: invokeData, error: invokeError } = await supabase.functions.invoke(functionName, {
          headers: {
            'X-Internal-Secret': INTERNAL_SECRET || ''
          },
          body: { 
            scheduled_job_id: job.id,
            tenant_id: job.tenant_id,
            triggered_by: 'scheduled'
          }
        });

        if (invokeError) {
          console.error(`[${requestId}] Error invoking ${functionName}:`, invokeError);
          results.push({
            name: job.name,
            job_type: job.job_type,
            status: 'error',
            message: invokeError.message
          });
          continue;
        }

        // Update last_run_at and calculate next_run_at
        const nextRunAt = calculateNextRun(job.cron_expr, now);
        
        await supabase
          .from('scheduled_jobs')
          .update({ 
            last_run_at: now.toISOString(),
            next_run_at: nextRunAt?.toISOString() || null
          })
          .eq('id', job.id);

        console.log(`[${requestId}] Successfully executed job: ${job.name}`);
        results.push({
          name: job.name,
          job_type: job.job_type,
          status: 'executed',
          message: 'Success'
        });

      } catch (jobError) {
        console.error(`[${requestId}] Error processing job ${job.name}:`, jobError);
        results.push({
          name: job.name,
          job_type: job.job_type,
          status: 'error',
          message: jobError instanceof Error ? jobError.message : 'Unknown error'
        });
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

    console.log(`[${requestId}] Completed:`, summary);

    // Log successful job execution
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'invoke-scheduled-jobs',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: {
          total_jobs: summary.total_jobs,
          executed: summary.executed,
          skipped: summary.skipped,
          errors: summary.errors,
        },
        p_processed_count: summary.executed,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      console.error(`[${requestId}] Failed to log job run:`, logErr);
    }

    return new Response(
      JSON.stringify(summary),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[${requestId}] Fatal error:`, error);

    // Log failed job execution
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'invoke-scheduled-jobs',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      console.error(`[${requestId}] Failed to log error:`, logErr);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Simple cron expression parser for common patterns
// Supports: star-slash-n (every n), specific numbers, star
function calculateNextRun(cronExpr: string, from: Date): Date | null {
  try {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return null;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const next = new Date(from);
    
    // Handle */n patterns for minutes
    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10);
      const currentMinute = next.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
      
      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1);
        next.setMinutes(nextMinute - 60);
      } else {
        next.setMinutes(nextMinute);
      }
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;
    }

    // Handle specific minute with */n hours
    if (minute !== '*' && hour.startsWith('*/')) {
      const hourInterval = parseInt(hour.slice(2), 10);
      const targetMinute = parseInt(minute, 10);
      
      next.setMinutes(targetMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
      
      // If we've passed this minute, go to next hour interval
      if (next <= from) {
        const currentHour = next.getHours();
        const nextHour = Math.ceil((currentHour + 1) / hourInterval) * hourInterval;
        
        if (nextHour >= 24) {
          next.setDate(next.getDate() + 1);
          next.setHours(nextHour - 24);
        } else {
          next.setHours(nextHour);
        }
      }
      return next;
    }

    // Handle specific hour and minute (e.g., "0 6 * * *" = 6:00 daily)
    if (!minute.includes('*') && !hour.includes('*')) {
      const targetMinute = parseInt(minute, 10);
      const targetHour = parseInt(hour, 10);
      
      next.setHours(targetHour);
      next.setMinutes(targetMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
      
      // If we've passed this time today, schedule for tomorrow
      if (next <= from) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    // Default: add 1 hour
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
    next.setSeconds(0);
    next.setMilliseconds(0);
    return next;

  } catch {
    return null;
  }
}
