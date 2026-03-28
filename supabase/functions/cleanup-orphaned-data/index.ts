/**
 * Cleanup Orphaned Data - Migrated to serveTenant (requires admin JWT)
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId } = ctx;

  // Check admin role
  const { data: userRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Starting cleanup operation', { userId, role: userRole.role, requestId });

  const results = {
    orphaned_jobs_deleted: 0,
    testev10_agent_deleted: false,
    testev10_tokens_deleted: 0,
    testev10_jobs_deleted: 0,
    testev10_metrics_deleted: 0,
    errors: [] as string[],
  };

  // 1. Delete orphaned jobs
  const { data: orphanedJobs, error: orphanedError } = await supabase
    .from('jobs')
    .delete()
    .is('agent_id', null)
    .select('id');

  if (orphanedError) {
    results.errors.push(`Orphaned jobs: ${orphanedError.message}`);
  } else {
    results.orphaned_jobs_deleted = orphanedJobs?.length || 0;
  }

  // 2. Find testev10 agent
  const { data: testAgent, error: agentError } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('agent_name', 'testev10')
    .single();

  if (!agentError && testAgent) {
    // Delete related data
    const { data: dTokens } = await supabase.from('agent_tokens').delete().eq('agent_id', testAgent.id).select('id');
    results.testev10_tokens_deleted = dTokens?.length || 0;

    const { data: dJobs } = await supabase.from('jobs').delete().eq('agent_id', testAgent.id).select('id');
    results.testev10_jobs_deleted = dJobs?.length || 0;

    const { data: dMetrics } = await supabase.from('agent_system_metrics_partitioned').delete().eq('agent_id', testAgent.id).select('id');
    results.testev10_metrics_deleted = dMetrics?.length || 0;

    const { error: deleteAgentError } = await supabase.from('agents').delete().eq('id', testAgent.id);
    results.testev10_agent_deleted = !deleteAgentError;
    if (deleteAgentError) results.errors.push(`testev10 agent: ${deleteAgentError.message}`);
  }

  const hasErrors = results.errors.length > 0;
  return {
    success: !hasErrors,
    message: hasErrors ? 'Cleanup completed with some errors' : 'Cleanup completed successfully',
    results,
  };
}, { methods: ['POST'] });
