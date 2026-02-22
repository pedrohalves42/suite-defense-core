import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID().slice(0, 8)
  const startedAt = Date.now()
  console.log(`[${requestId}] detect-blocked-attempts: Starting correlation...`)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Set a statement timeout to prevent the RPC from hanging
    try {
      await supabase.rpc('set_config', {
        setting: 'statement_timeout',
        value: '15000'
      });
    } catch {
      // set_config may not exist, continue anyway
    }

    // Execute the correlation function with a timeout race
    const timeoutMs = 20000; // 20s total timeout
    const rpcPromise = supabase.rpc('detect_blocked_access_attempts');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RPC timeout after 20s')), timeoutMs)
    );

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any;

    if (error) {
      const isTimeout = error.code === '57014' || error.message?.includes('timeout');
      console.error(`[${requestId}] Detection ${isTimeout ? 'timed out' : 'failed'}:`, error);

      // Log observability even on failure
      try {
        await supabase.rpc('log_scheduled_job_run', {
          p_job_key: 'detect-blocked-attempts',
          p_success: false,
          p_duration_ms: Date.now() - startedAt,
          p_error: isTimeout ? 'RPC timeout - consider adding indexes on agent_web_activity(domain, visited_at)' : error.message,
          p_result: null,
          p_processed_count: 0,
          p_job_source: 'cron'
        });
      } catch (e) { console.warn('[detect-blocked-attempts] Failed to log job run:', e); }

      return new Response(
        JSON.stringify({ 
          status: isTimeout ? 'timeout' : 'error',
          error: isTimeout ? 'Query timed out. The blocked_access_attempts correlation query needs optimization.' : error.message,
          suggestion: isTimeout ? 'Add indexes: CREATE INDEX idx_awa_domain_visited ON agent_web_activity(domain, visited_at); CREATE INDEX idx_baa_agent_domain ON blocked_access_attempts(agent_id, domain, attempted_at);' : undefined,
          requestId 
        }),
        { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const insertedCount = data?.[0]?.inserted_count ?? 0
    console.log(`[${requestId}] Detected ${insertedCount} new blocked attempts in ${Date.now() - startedAt}ms`)

    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'detect-blocked-attempts',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { inserted_count: insertedCount },
        p_processed_count: insertedCount,
        p_job_source: 'cron'
      });
    } catch (e) { console.warn('[detect-blocked-attempts] Failed to log job run:', e); }

    return new Response(
      JSON.stringify({ 
        status: 'ok',
        inserted_count: insertedCount,
        duration_ms: Date.now() - startedAt,
        requestId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const errMsg = String(err);
    const isTimeout = errMsg.includes('timeout') || errMsg.includes('20s');
    console.error(`[${requestId}] ${isTimeout ? 'Timeout' : 'Exception'}:`, err)
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'detect-blocked-attempts',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: errMsg,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      })
    } catch (e) { console.warn('[detect-blocked-attempts] Failed to log error run:', e); }
    
    return new Response(
      JSON.stringify({ 
        status: isTimeout ? 'timeout' : 'error',
        error: errMsg,
        requestId 
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
