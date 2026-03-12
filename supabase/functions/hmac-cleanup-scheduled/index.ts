import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * HMAC Cleanup Scheduled Function
 * Runs every 2 hours to clean up old HMAC signatures
 * Prevents table bloat from 14k+ signatures/day
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  // V-1116: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info(`[${requestId}] HMAC cleanup started`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete signatures older than 6 hours (well beyond the 5-minute replay window)
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    
    const { data: deleted, error } = await supabase
      .from('hmac_signatures')
      .delete()
      .lt('used_at', cutoff.toISOString())
      .select('id');

    if (error) {
      logger.error(`[${requestId}] Error deleting signatures`, error);
      throw error;
    }

    const deletedCount = deleted?.length || 0;
    const duration = Date.now() - startTime;
    
    logger.success(`[${requestId}] Deleted ${deletedCount} HMAC signatures in ${duration}ms`);

    // Log cleanup action for audit
    await supabase.from('audit_logs').insert({
      action: 'hmac_cleanup_scheduled',
      resource_type: 'system',
      resource_id: 'hmac_signatures',
      success: true,
      details: { 
        deleted_count: deletedCount, 
        cutoff: cutoff.toISOString(),
        duration_ms: duration,
        request_id: requestId 
      }
    });

    // Log observability to scheduled_job_runs
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'hmac-cleanup-scheduled',
      p_success: true,
      p_duration_ms: duration,
      p_result: { deleted_count: deletedCount, cutoff: cutoff.toISOString() },
      p_processed_count: deletedCount,
      p_job_source: 'cron'
    });

    return new Response(JSON.stringify({ 
      success: true, 
      deleted: deletedCount,
      duration_ms: duration,
      cutoff: cutoff.toISOString(),
      next_run: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      request_id: requestId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] HMAC cleanup failed after ${duration}ms`, error);
    
    // Log error observability
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'hmac-cleanup-scheduled',
        p_success: false,
        p_duration_ms: duration,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { console.warn('[hmac-cleanup-scheduled] Failed to log job run:', e); }
    
    return new Response(JSON.stringify({ 
      error: 'Cleanup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: duration,
      request_id: requestId 
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
