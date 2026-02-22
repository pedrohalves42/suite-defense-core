import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  
  logger.info(`[cleanup-stuck-builds][${requestId}] Function started`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment variables
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      logger.error(`[${requestId}] Missing environment variables`);
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Authentication logic:
    // 1. Cron jobs send: Authorization: Bearer <anon_key>
    // 2. Internal calls send: X-Internal-Secret header
    // 3. Scheduled calls may have no auth (direct invoke)
    const authHeader = req.headers.get('authorization');
    const providedSecret = req.headers.get('X-Internal-Secret');

    // Detect cron call (sends anon key in Bearer token)
    const isCronCall = authHeader?.startsWith('Bearer ') && 
                       authHeader?.includes(SUPABASE_ANON_KEY?.substring(0, 20) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

    // Detect scheduled call (no auth headers)
    const isScheduledCall = !authHeader && !providedSecret;

    // Detect internal call (with secret)
    const isInternalCall = INTERNAL_FUNCTION_SECRET && providedSecret === INTERNAL_FUNCTION_SECRET;

    // Allow: cron calls, scheduled calls, or internal calls with valid secret
    if (!isCronCall && !isScheduledCall && !isInternalCall) {
      logger.warn(`[${requestId}] Unauthorized access attempt - authHeader present but not recognized`);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const callType = isCronCall ? 'cron' : isScheduledCall ? 'scheduled' : 'internal';
    logger.info(`[${requestId}] Authorized call type: ${callType}`);

    // Create Supabase client with service role
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    logger.info(`[${requestId}] Executing cleanup function`);

    // Execute the cleanup function
    const { data, error } = await supabaseClient.rpc('cleanup_stuck_builds');

    if (error) {
      logger.error(`[${requestId}] Cleanup function failed`, error);
      
      // Log failure
      try {
        await supabaseClient.rpc('log_scheduled_job_run', {
          p_job_key: 'cleanup-stuck-builds',
          p_success: false,
          p_duration_ms: Date.now() - startedAt,
          p_error: error.message,
          p_result: null,
          p_processed_count: 0,
          p_job_source: callType
        });
      } catch (e) { console.warn('[cleanup-stuck-builds] Failed to log job run:', e); }
      
      return new Response(
        JSON.stringify({
          error: 'Cleanup failed',
          message: error.message,
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : { cleaned_count: 0, build_ids: [] };
    
    logger.info(`[${requestId}] Cleanup completed: ${result.cleaned_count || 0} builds cleaned`);

    // Log observability
    try {
      await supabaseClient.rpc('log_scheduled_job_run', {
        p_job_key: 'cleanup-stuck-builds',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: result,
        p_processed_count: result.cleaned_count || 0,
        p_job_source: callType
      });
    } catch (logError: unknown) {
      logger.warn(`[${requestId}] Failed to log job run`, logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        cleaned_count: result.cleaned_count || 0,
        build_ids: result.build_ids || [],
        message: `Successfully cleaned ${result.cleaned_count || 0} stuck build(s)`,
        callType,
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error(`[${requestId}] Unexpected error`, error);
    
    // Log error observability
    try {
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabaseClient.rpc('log_scheduled_job_run', {
        p_job_key: 'cleanup-stuck-builds',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'unknown'
      });
    } catch (e) { console.warn('[cleanup-stuck-builds] Failed to log error run:', e); }
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
