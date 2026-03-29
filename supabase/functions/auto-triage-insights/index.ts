import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1102: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    logger.info('[auto-triage-insights] Starting auto-triage of old informational insights...');

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get insights to triage
    const { data: insightsToTriage, error: fetchError } = await supabase
      .from('ai_insights')
      .select('id, insight_type, severity, created_at')
      .eq('acknowledged', false)
      .in('severity', ['info', 'warning'])
      .lt('created_at', sevenDaysAgo.toISOString());

    if (fetchError) {
      logger.error('[auto-triage-insights] Error fetching insights:', fetchError);
      throw fetchError;
    }

    if (!insightsToTriage || insightsToTriage.length === 0) {
      logger.info('[auto-triage-insights] No insights to auto-triage');
      return new Response(
        JSON.stringify({ 
          success: true, 
          triaged: 0, 
          message: 'No insights to auto-triage' 
        }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[auto-triage-insights] Found ${insightsToTriage.length} insights to auto-triage`);

    // Update insights
    const { data: updated, error: updateError } = await supabase
      .from('ai_insights')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        metadata: {
          auto_triaged: true,
          auto_triage_reason: 'informational insight older than 7 days',
          auto_triaged_at: new Date().toISOString()
        }
      })
      .eq('acknowledged', false)
      .in('severity', ['info', 'warning'])
      .lt('created_at', sevenDaysAgo.toISOString())
      .select('id');

    if (updateError) {
      logger.error('[auto-triage-insights] Error updating insights:', updateError);
      throw updateError;
    }

    const triagedCount = updated?.length || 0;
    logger.info(`[auto-triage-insights] Auto-triaged ${triagedCount} insights`);

    // Log audit event (defensive - non-blocking)
    if (triagedCount > 0) {
      try {
        await supabase.from('audit_logs').insert({
          action: 'auto_triage_insights',
          resource_type: 'ai_insight',
          resource_id: 'system_cron',
          details: {
            triaged_count: triagedCount,
            insight_ids: updated?.map(i => i.id) || [],
            description: `Auto-triaged ${triagedCount} informational insights older than 7 days`
          },
          success: true
        });
      } catch (auditError) {
        logger.warn('[auto-triage-insights] Audit log failed (non-blocking):', auditError);
        // Don't block the operation if audit fails
      }
    }

    const durationMs = Date.now() - startedAt;

    // Log successful job execution
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'auto-triage-insights',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: {
          triaged: triagedCount,
          insight_ids: updated?.map(i => i.id) || [],
        },
        p_processed_count: triagedCount,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.warn('[auto-triage-insights] Failed to log job run:', logErr);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        triaged: triagedCount,
        message: `Auto-triaged ${triagedCount} informational insights`,
        duration_ms: durationMs
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[auto-triage-insights] Error:', error);

    // Log failed job execution
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'auto-triage-insights',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: errorMessage,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.warn('[auto-triage-insights] Failed to log error:', logErr);
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
