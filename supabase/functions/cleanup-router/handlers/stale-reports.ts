/**
 * Handler: Cleanup Stale Reports
 * Marks stale security reports as failed after timeout thresholds.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

export async function handleCleanupStaleReports(supabase: SupabaseClient, requestId: string) {
  const STALE_HOURS = 24;
  const results = { processed: 0, cleaned: 0, retried: 0, failed: 0, errors: [] as string[] };

  const cutoffTime = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleReports, error: fetchError } = await supabase
    .from('security_reports')
    .select('id, tenant_id, report_type, status, created_at')
    .in('status', ['pending', 'processing', 'generated'])
    .lt('created_at', cutoffTime);

  if (fetchError) throw new Error(`Failed to fetch stale reports: ${fetchError.message}`);

  if (!staleReports || staleReports.length === 0) {
    return { success: true, ...results };
  }

  logger.info(`[${requestId}] [cleanup:stale-reports] Found ${staleReports.length} stale reports`);

  for (const report of staleReports) {
    results.processed++;
    try {
      const ageHours = Math.floor((Date.now() - new Date(report.created_at).getTime()) / (1000 * 60 * 60));

      if (ageHours > 48) {
        const { error: updateError } = await supabase
          .from('security_reports')
          .update({ status: 'failed', error_message: `Relatorio expirado apos ${ageHours} horas sem conclusao`, updated_at: new Date().toISOString() })
          .eq('id', report.id);
        if (updateError) results.errors.push(`Failed to update report ${report.id}: ${updateError.message}`);
        else { results.failed++; results.cleaned++; }
      } else if (report.status === 'generated') {
        const { error: completeError } = await supabase
          .from('security_reports')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', report.id);
        if (completeError) results.errors.push(`Failed to complete report ${report.id}: ${completeError.message}`);
        else { results.retried++; results.cleaned++; }
      } else {
        const { error: failError } = await supabase
          .from('security_reports')
          .update({ status: 'failed', error_message: `Relatorio travado em status "${report.status}" por ${ageHours} horas`, updated_at: new Date().toISOString() })
          .eq('id', report.id);
        if (!failError) results.cleaned++;
      }
    } catch (err) {
      results.errors.push(`Error processing report ${report.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { success: true, ...results };
}
