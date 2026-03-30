/**
 * Handler: Cleanup Stuck Jobs
 * Fails delivered jobs that agents never reported, handles TTL expiry, zombie executions.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

export async function handleCleanupStuckJobs(supabase: SupabaseClient, requestId: string) {
  const MAX_DELIVERY_ATTEMPTS = 5;
  const STUCK_TIMEOUT_MINUTES = 10;
  const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Stuck delivered -> FAILED
  const { data: stuckDelivered, error: stuckError } = await supabase
    .from('jobs')
    .select('id, agent_name, type, delivered_at, delivery_attempts, expires_at')
    .eq('status', 'delivered')
    .lt('delivered_at', cutoffTime);

  if (stuckError) logger.error(`[${requestId}] [cleanup:stuck-jobs] Error fetching stuck delivered:`, stuckError);

  let failedDeliveredCount = 0;
  if (stuckDelivered && stuckDelivered.length > 0) {
    const retryable: typeof stuckDelivered = [];
    for (const job of stuckDelivered) {
      const attempts = job.delivery_attempts || 0;
      const expired = job.expires_at && new Date(job.expires_at) < new Date(now);
      if (attempts < MAX_DELIVERY_ATTEMPTS - 1 && !expired) retryable.push(job);
    }

    const allIds = stuckDelivered.map(j => j.id);
    if (allIds.length > 0) {
      const { error: failError } = await supabase
        .from('jobs')
        .update({ status: 'failed', completed_at: now, error_message: '[CLEANUP] Job delivered but agent never submitted result', failure_class: 'AGENT_STALLED' })
        .in('id', allIds);
      if (!failError) failedDeliveredCount = allIds.length;
    }

    for (const job of retryable) {
      const { data: fullJob } = await supabase
        .from('jobs')
        .select('tenant_id, agent_id, agent_name, type, payload, priority, expires_at')
        .eq('id', job.id)
        .single();
      if (fullJob?.type) {
        await supabase.from('jobs').insert({
          tenant_id: fullJob.tenant_id, agent_id: fullJob.agent_id, agent_name: fullJob.agent_name, type: fullJob.type,
          payload: fullJob.payload || {}, status: 'queued', approved: true, priority: fullJob.priority,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          delivery_attempts: (job.delivery_attempts || 0) + 1,
        });
      }
    }
  }

  // Zombie executions
  let zombieCleaned = { total: 0 };
  try {
    const { data: zombieResult } = await supabase.rpc('cleanup_zombie_executions');
    if (zombieResult) zombieCleaned = zombieResult as { total: number };
  } catch (_) { /* non-critical */ }

  // Expired TTL jobs
  const { data: expiredJobs } = await supabase
    .from('jobs')
    .select('id')
    .in('status', ['queued', 'delivered', 'pending'])
    .lt('expires_at', now);

  let expiredCount = 0;
  if (expiredJobs && expiredJobs.length > 0) {
    const { error: expireError } = await supabase
      .from('jobs')
      .update({ status: 'failed', error_message: '[DLQ:EXPIRED_TTL] Job expired (TTL exceeded)', completed_at: now, failure_class: 'EXPIRED' })
      .in('id', expiredJobs.map(j => j.id));
    if (!expireError) expiredCount = expiredJobs.length;
  }

  return {
    success: true, timestamp: now,
    stuck_delivered_failed: failedDeliveredCount,
    zombie_executions_cleaned: zombieCleaned.total,
    expired_failed: expiredCount,
    total_cleaned: failedDeliveredCount + expiredCount + zombieCleaned.total,
  };
}
