/**
 * Handler: Auto Cleanup Jobs
 * Cancels stale queued jobs and fails timed-out delivered jobs, with retry for recurring.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function handleAutoCleanupJobs(supabase: SupabaseClient, requestId: string, body: Record<string, unknown>) {
  // KILL SWITCH CHECK
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    return { success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' };
  }

  const queuedThresholdHours = (body.queued_threshold_hours as number) ?? 2;
  const deliveredThresholdHours = (body.delivered_threshold_hours as number) ?? 0.5;
  const targetTenantId = (body.tenant_id as string) ?? null;
  const enableRetry = (body.enable_retry as boolean) ?? true;

  const queuedCutoff = new Date(Date.now() - queuedThresholdHours * 60 * 60 * 1000).toISOString();
  const deliveredCutoff = new Date(Date.now() - deliveredThresholdHours * 60 * 60 * 1000).toISOString();

  // Cancel old queued jobs
  let queuedQuery = supabase.from('jobs').update({ status: 'cancelled', error_message: `Auto-cancelled: agent did not collect job within ${queuedThresholdHours}h`, completed_at: new Date().toISOString() }).eq('status', 'queued').lt('created_at', queuedCutoff);
  if (targetTenantId) queuedQuery = queuedQuery.eq('tenant_id', targetTenantId);
  const { data: cancelledJobs, error: cancelError } = await queuedQuery.select('id, tenant_id');
  if (cancelError) throw cancelError;

  // Fail old delivered jobs
  let deliveredQuery = supabase.from('jobs').update({ status: 'failed', error_message: `Timeout: agent did not report result within ${deliveredThresholdHours}h`, completed_at: new Date().toISOString() }).eq('status', 'delivered').lt('delivered_at', deliveredCutoff);
  if (targetTenantId) deliveredQuery = deliveredQuery.eq('tenant_id', targetTenantId);
  const { data: failedJobs, error: failError } = await deliveredQuery.select('id, tenant_id');
  if (failError) throw failError;

  const queuedCancelled = cancelledJobs?.length ?? 0;
  const deliveredFailed = failedJobs?.length ?? 0;
  const allJobs = [...(cancelledJobs ?? []), ...(failedJobs ?? [])];
  const tenantsAffected = [...new Set(allJobs.map(j => j.tenant_id))];

  // Retry recurring jobs
  let retriedCount = 0;
  if (enableRetry && failedJobs && failedJobs.length > 0) {
    for (const failedJob of failedJobs) {
      const { data: originalJob } = await supabase.from('jobs').select('type, agent_id, agent_name, tenant_id, payload, is_recurring').eq('id', failedJob.id).single();
      if (originalJob?.is_recurring && originalJob?.agent_id) {
        const { error: retryError } = await supabase.from('jobs').insert({
          type: originalJob.type, agent_id: originalJob.agent_id, agent_name: originalJob.agent_name, tenant_id: originalJob.tenant_id, status: 'queued', approved: true,
          payload: { ...(originalJob.payload as Record<string, unknown>), retry_of: failedJob.id, retry_count: ((originalJob.payload as Record<string, unknown>)?.retry_count as number || 0) + 1 },
          is_recurring: true, parent_job_id: failedJob.id,
        });
        if (!retryError) retriedCount++;
      }
    }
  }

  return { success: true, queued_cancelled: queuedCancelled, delivered_failed: deliveredFailed, total_cleaned: queuedCancelled + deliveredFailed, retried: retriedCount, tenants_affected: tenantsAffected };
}
