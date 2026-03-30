/**
 * Handler: Cleanup Jobs (Admin, JWT auth)
 * Batch deletes old jobs with safety checks for executions.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function handleCleanupJobs(supabase: SupabaseClient, requestId: string, body: Record<string, unknown>, tenantId: string) {
  const status = (body.status as string[]) || ['failed', 'delivered'];
  const older_than_days = (body.older_than_days as number) || 7;
  const agent_name = body.agent_name as string | undefined;
  const only_undelivered = (body.only_undelivered as boolean) ?? true;
  const require_no_executions = (body.require_no_executions as boolean) ?? true;

  const cutoffDate = new Date();
  if (older_than_days > 0) cutoffDate.setDate(cutoffDate.getDate() - older_than_days);

  let parentQuery = supabase.from('jobs').select('id').eq('tenant_id', tenantId);
  if (status.length > 0) parentQuery = parentQuery.in('status', status);
  if (older_than_days > 0) parentQuery = parentQuery.lt('created_at', cutoffDate.toISOString());
  if (agent_name) parentQuery = parentQuery.eq('agent_name', agent_name);
  if (only_undelivered) parentQuery = parentQuery.is('delivered_at', null);

  const { data: parentJobs, error: parentQueryError } = await parentQuery;
  if (parentQueryError) throw new Error(`Failed to query jobs: ${parentQueryError.message}`);

  if (!parentJobs || parentJobs.length === 0) {
    return { success: true, deleted_count: 0, skipped_count: 0, filters: { status, older_than_days, agent_name, only_undelivered, require_no_executions }, requestId };
  }

  let parentIds = parentJobs.map(j => j.id);
  let skippedCount = 0;

  if (require_no_executions && parentIds.length > 0) {
    const { data: jobsWithExecutions } = await supabase.from('job_executions').select('job_id').in('job_id', parentIds);
    const jobsWithExecSet = new Set((jobsWithExecutions || []).map(e => e.job_id));
    const originalCount = parentIds.length;
    parentIds = parentIds.filter(id => !jobsWithExecSet.has(id));
    skippedCount = originalCount - parentIds.length;
  }

  if (parentIds.length === 0) {
    return { success: true, deleted_count: 0, skipped_count: skippedCount, skipped_reason: 'Jobs com execucoes recentes nao podem ser removidos', filters: { status, older_than_days, agent_name, only_undelivered, require_no_executions }, requestId };
  }

  const BATCH_SIZE = 100;
  let totalDeleted = 0;
  for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
    const batch = parentIds.slice(i, i + BATCH_SIZE);
    await supabase.from('generated_reports').delete().in('job_id', batch);
    await supabase.from('jobs').delete().in('parent_job_id', batch);
    const { data: deletedJobs } = await supabase.from('jobs').delete().in('id', batch).select('id');
    totalDeleted += deletedJobs?.length || 0;
  }

  return { success: true, deleted_count: totalDeleted, skipped_count: skippedCount, skipped_reason: skippedCount > 0 ? 'Jobs com execucoes nao podem ser removidos' : null, filters: { status, older_than_days, agent_name, only_undelivered, require_no_executions }, requestId };
}
