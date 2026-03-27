import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const STALE_HOURS = 24;

Deno.serve(async (req) => {
  const startedAt = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1111: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const results = {
    processed: 0,
    cleaned: 0,
    retried: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    logger.info('[cleanup-stale-reports] Starting cleanup...');

    const cutoffTime = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    // Find stale reports (not completed after 24 hours)
    const { data: staleReports, error: fetchError } = await supabase
      .from('security_reports')
      .select('id, tenant_id, report_type, status, created_at')
      .in('status', ['pending', 'processing', 'generated'])
      .lt('created_at', cutoffTime);

    if (fetchError) {
      throw new Error(`Failed to fetch stale reports: ${fetchError.message}`);
    }

    if (!staleReports || staleReports.length === 0) {
      logger.info('[cleanup-stale-reports] No stale reports found');
      
      // Log observability using RPC with job_key
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'cleanup-stale-reports',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { message: 'No stale reports found' },
        p_processed_count: 0,
        p_job_source: 'cron'
      });

      return new Response(
        JSON.stringify({ success: true, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[cleanup-stale-reports] Found ${staleReports.length} stale reports`);

    for (const report of staleReports) {
      results.processed++;
      
      try {
        const ageHours = Math.floor((Date.now() - new Date(report.created_at).getTime()) / (1000 * 60 * 60));

        if (ageHours > 48) {
          // Too old, mark as failed
          const { error: updateError } = await supabase
            .from('security_reports')
            .update({
              status: 'failed',
              error_message: `Relatório expirado após ${ageHours} horas sem conclusão`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', report.id);

          if (updateError) {
            results.errors.push(`Failed to update report ${report.id}: ${updateError.message}`);
          } else {
            results.failed++;
            results.cleaned++;
          }
        } else if (report.status === 'generated') {
          // Generated but not completed - try to complete it
          const { error: completeError } = await supabase
            .from('security_reports')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', report.id);

          if (completeError) {
            results.errors.push(`Failed to complete report ${report.id}: ${completeError.message}`);
          } else {
            results.retried++;
            results.cleaned++;
          }
        } else {
          // Pending or processing for too long - mark as failed for retry
          const { error: failError } = await supabase
            .from('security_reports')
            .update({
              status: 'failed',
              error_message: `Relatório travado em status "${report.status}" por ${ageHours} horas`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', report.id);

          if (!failError) {
            results.cleaned++;
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Error processing report ${report.id}: ${errorMsg}`);
      }
    }

    logger.info('[cleanup-stale-reports] Cleanup complete:', results);

    // Log observability - success using RPC with job_key
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'cleanup-stale-reports',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: results,
      p_processed_count: results.processed,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('[cleanup-stale-reports] Error:', error);

    // Log observability - failure using RPC with job_key
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'cleanup-stale-reports',
      p_success: false,
      p_duration_ms: Date.now() - startedAt,
      p_error: error instanceof Error ? error.message : 'Unknown error',
      p_result: results,
      p_processed_count: results.processed,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
