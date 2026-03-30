/**
 * Handler: Cleanup Stale Playbooks
 * Marks timed-out playbook executions as failed and creates system alerts.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

export async function handleCleanupStalePlaybooks(supabase: SupabaseClient, requestId: string) {
  const TIMEOUT_MINUTES = 30;
  const results = { processed: 0, cleaned: 0, alertsCreated: 0, errors: [] as string[] };

  const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: staleExecutions, error: fetchError } = await supabase
    .from('playbook_executions')
    .select('id, playbook_id, tenant_id, started_at, status')
    .in('status', ['pending', 'in_progress'])
    .lt('started_at', cutoffTime);

  if (fetchError) throw new Error(`Failed to fetch stale executions: ${fetchError.message}`);

  if (!staleExecutions || staleExecutions.length === 0) {
    return { success: true, cleaned: 0 };
  }

  for (const execution of staleExecutions) {
    results.processed++;
    try {
      const { error: updateError } = await supabase
        .from('playbook_executions')
        .update({ status: 'failed', completed_at: new Date().toISOString(), notes: `Timeout automatico: execucao excedeu ${TIMEOUT_MINUTES} minutos sem conclusao` })
        .eq('id', execution.id);
      if (updateError) { results.errors.push(`Failed to update execution ${execution.id}: ${updateError.message}`); continue; }
      results.cleaned++;

      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({ tenant_id: execution.tenant_id, alert_type: 'playbook_timeout', severity: 'high', message: `Execucao de playbook travada por mais de ${TIMEOUT_MINUTES} minutos foi automaticamente marcada como falha`, metadata: { execution_id: execution.id, playbook_id: execution.playbook_id, started_at: execution.started_at, original_status: execution.status }, resolved: false });
      if (!alertError) results.alertsCreated++;
    } catch (err) {
      results.errors.push(`Error processing execution ${execution.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { success: true, ...results };
}
