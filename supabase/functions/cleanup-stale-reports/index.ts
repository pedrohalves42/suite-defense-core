import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STALE_HOURS = 24; // Reports stuck for more than 24 hours

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[cleanup-stale-reports] Starting cleanup...');

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

    const results = {
      cleaned: 0,
      retried: 0,
      failed: 0,
      errors: [] as string[],
    };

    if (!staleReports || staleReports.length === 0) {
      console.log('[cleanup-stale-reports] No stale reports found');
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[cleanup-stale-reports] Found ${staleReports.length} stale reports`);

    for (const report of staleReports) {
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

    console.log('[cleanup-stale-reports] Cleanup complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[cleanup-stale-reports] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
