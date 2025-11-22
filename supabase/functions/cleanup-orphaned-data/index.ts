import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Verify user authentication and admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      logger.error('Authentication failed', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin or super_admin
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      logger.warn('Unauthorized cleanup attempt', { userId: user.id });
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Starting cleanup operation', { userId: user.id, role: userRole.role });

    const results = {
      orphaned_jobs_deleted: 0,
      testev10_agent_deleted: false,
      testev10_tokens_deleted: 0,
      testev10_jobs_deleted: 0,
      testev10_metrics_deleted: 0,
      errors: [] as string[]
    };

    // 1. Delete orphaned jobs (jobs without valid agent_id)
    logger.info('Deleting orphaned jobs...');
    const { data: orphanedJobs, error: orphanedError } = await supabase
      .from('jobs')
      .delete()
      .is('agent_id', null)
      .select('id');

    if (orphanedError) {
      logger.error('Failed to delete orphaned jobs', orphanedError);
      results.errors.push(`Orphaned jobs: ${orphanedError.message}`);
    } else {
      results.orphaned_jobs_deleted = orphanedJobs?.length || 0;
      logger.info('Orphaned jobs deleted', { count: results.orphaned_jobs_deleted });
    }

    // 2. Find testev10 agent
    logger.info('Looking for testev10 agent...');
    const { data: testAgent, error: agentError } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('agent_name', 'testev10')
      .single();

    if (agentError) {
      if (agentError.code === 'PGRST116') {
        logger.info('testev10 agent not found (already deleted or never existed)');
      } else {
        logger.error('Error finding testev10 agent', agentError);
        results.errors.push(`Find testev10: ${agentError.message}`);
      }
    } else if (testAgent) {
      logger.info('Found testev10 agent', { agentId: testAgent.id });

      // 3. Delete agent_tokens for testev10
      const { data: deletedTokens, error: tokensError } = await supabase
        .from('agent_tokens')
        .delete()
        .eq('agent_id', testAgent.id)
        .select('id');

      if (tokensError) {
        logger.error('Failed to delete testev10 tokens', tokensError);
        results.errors.push(`testev10 tokens: ${tokensError.message}`);
      } else {
        results.testev10_tokens_deleted = deletedTokens?.length || 0;
        logger.info('testev10 tokens deleted', { count: results.testev10_tokens_deleted });
      }

      // 4. Delete jobs for testev10
      const { data: deletedJobs, error: jobsError } = await supabase
        .from('jobs')
        .delete()
        .eq('agent_id', testAgent.id)
        .select('id');

      if (jobsError) {
        logger.error('Failed to delete testev10 jobs', jobsError);
        results.errors.push(`testev10 jobs: ${jobsError.message}`);
      } else {
        results.testev10_jobs_deleted = deletedJobs?.length || 0;
        logger.info('testev10 jobs deleted', { count: results.testev10_jobs_deleted });
      }

      // 5. Delete metrics for testev10
      const { data: deletedMetrics, error: metricsError } = await supabase
        .from('agent_system_metrics')
        .delete()
        .eq('agent_id', testAgent.id)
        .select('id');

      if (metricsError) {
        logger.error('Failed to delete testev10 metrics', metricsError);
        results.errors.push(`testev10 metrics: ${metricsError.message}`);
      } else {
        results.testev10_metrics_deleted = deletedMetrics?.length || 0;
        logger.info('testev10 metrics deleted', { count: results.testev10_metrics_deleted });
      }

      // 6. Finally, delete the testev10 agent itself
      const { error: deleteAgentError } = await supabase
        .from('agents')
        .delete()
        .eq('id', testAgent.id);

      if (deleteAgentError) {
        logger.error('Failed to delete testev10 agent', deleteAgentError);
        results.errors.push(`testev10 agent: ${deleteAgentError.message}`);
      } else {
        results.testev10_agent_deleted = true;
        logger.success('testev10 agent deleted successfully');
      }
    }

    // Return summary
    const hasErrors = results.errors.length > 0;
    logger.info('Cleanup operation completed', { results, hasErrors });

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        message: hasErrors 
          ? 'Cleanup completed with some errors' 
          : 'Cleanup completed successfully',
        results
      }),
      { 
        status: hasErrors ? 207 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    logger.error('Cleanup operation failed', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
