import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts'
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

}

/**
 * CHECK-TASK-SLA-BREACH - Scheduled Edge Function
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1145: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    logger.info('[check-task-sla-breach] Starting SLA breach check...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Call the database function that checks and flags SLA breaches
    const { data: breachedCount, error: checkError } = await supabase
      .rpc('check_task_sla_breach');

    if (checkError) {
      logger.error('[check-task-sla-breach] Error checking SLA breaches:', checkError);
      
      // Log failure with observability
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-task-sla-breach',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: checkError.message,
        p_result: { error: checkError.message },
        p_processed_count: 0,
        p_job_source: 'cron'
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: checkError.message 
        }), 
        { 
          status: 500,
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        }
      );
    }

    const tasksBreached = breachedCount || 0;
    
    logger.info(`[check-task-sla-breach] SLA check complete:`, {
      tasksBreached,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    });

    // Also run anomaly alerts check
    const { error: anomalyError } = await supabase
      .rpc('check_job_health_anomalies_and_alert');
    
    if (anomalyError) {
      logger.warn('[check-task-sla-breach] Error checking job anomalies:', anomalyError);
    }

    // Log success with observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-task-sla-breach',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: { 
        tasksBreached,
        anomalyCheckRan: !anomalyError
      },
      p_processed_count: tasksBreached,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        tasksBreached,
        anomalyCheckRan: !anomalyError,
        timestamp: new Date().toISOString()
      }), 
      { 
        status: 200,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[check-task-sla-breach] Unexpected error:', error);
    
    // Try to log failure
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-task-sla-breach',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: errorMessage,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch {
      logger.error('[check-task-sla-breach] Failed to log error');
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    );
  }
});
