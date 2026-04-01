/**
 * ai-execute-solution → Migrated to serveTenant() (V-1098)
 * Previously had NO caller authentication.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ExecuteSolutionSchema = z.object({
  action_id: z.string().uuid('action_id must be a valid UUID'),
  solution_type: z.enum(['cleanup_stuck_jobs', 'acknowledge_alerts', 'create_security_jobs', 'restart_agent_collection', 'cleanup_old_data']),
  parameters: z.record(z.unknown()).optional().default({}),
});

serveTenant(async (_req, ctx) => {
  const origin = _req.headers.get("origin");
  const { tenantId, supabase, body } = ctx;

  const parsed = ExecuteSolutionSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const { action_id, solution_type, parameters } = parsed.data;

  logger.info(`[AI-EXECUTE-SOLUTION] Executing ${solution_type} for action ${action_id}`);

  // Get action details
  const { data: action, error: actionError } = await supabase
    .from('ai_actions')
    .select('*, ai_insights(*)')
    .eq('id', action_id)
    .eq('tenant_id', tenantId)
    .single();

  if (actionError || !action) {
    return new Response(
      JSON.stringify({ error: 'Action not found or unauthorized' }),
      { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  let result: Record<string, unknown> = {};
  const success = true;
  const error_message = null;

  switch (solution_type) {
    case 'cleanup_stuck_jobs': {
      const { data: cleanupResult, error } = await supabase.rpc('cleanup_stuck_jobs');
      if (error) throw error;
      result = { cleaned_count: cleanupResult?.[0]?.cleaned_count || 0, job_ids: cleanupResult?.[0]?.job_ids || [] };
      break;
    }
    case 'acknowledge_alerts': {
      const { data: ackResult, error } = await supabase.rpc('acknowledge_all_alerts', { p_tenant_id: tenantId });
      if (error) throw error;
      result = ackResult;
      break;
    }
    case 'create_security_jobs': {
      const onlineThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: agents, error: agentsError } = await supabase
        .from('agents').select('id, agent_name')
        .eq('tenant_id', tenantId).eq('status', 'active').gte('last_heartbeat', onlineThreshold);
      if (agentsError) throw agentsError;

      const securityJobs = ['software_inventory_collect', 'collect_antivirus_status', 'collect_web_activity', 'light_vuln_scan'];
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const jobsToCreate = (agents || []).flatMap(agent =>
        securityJobs.map(jobType => ({
          tenant_id: tenantId, agent_id: agent.id, agent_name: agent.agent_name,
          type: jobType, status: 'queued', approved: true, payload: {}, expires_at: expiresAt,
        }))
      );
      if (jobsToCreate.length > 0) {
        const { error: jobsError } = await supabase.from('jobs').insert(jobsToCreate);
        if (jobsError) throw jobsError;
      }
      result = { jobs_created: jobsToCreate.length, agents_count: agents?.length || 0 };
      break;
    }
    case 'restart_agent_collection': {
      const agent_id = parameters.agent_id as string | undefined;
      if (!agent_id) throw new Error('agent_id required in parameters');

      const onlineThreshold2 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: agent } = await supabase
        .from('agents').select('agent_name, last_heartbeat, status')
        .eq('id', agent_id).eq('tenant_id', tenantId).single();
      if (!agent) throw new Error('Agent not found');

      const agentIsOnline = agent.status === 'active' && agent.last_heartbeat && new Date(agent.last_heartbeat) > new Date(onlineThreshold2);
      if (!agentIsOnline) { result = { skipped: true, reason: 'Agent offline', agent_name: agent.agent_name }; break; }

      const securityJobs = ['software_inventory_collect', 'collect_antivirus_status', 'collect_web_activity', 'light_vuln_scan'];
      const expiresAt2 = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const jobsToCreate = securityJobs.map(jobType => ({
        tenant_id: tenantId, agent_id, agent_name: agent.agent_name,
        type: jobType, status: 'queued', approved: true, payload: {}, expires_at: expiresAt2,
      }));
      const { error: jobsError } = await supabase.from('jobs').insert(jobsToCreate);
      if (jobsError) throw jobsError;
      result = { jobs_created: jobsToCreate.length, agent_name: agent.agent_name };
      break;
    }
    case 'cleanup_old_data': {
      const days = (parameters.days as number) || 7;
      const { data: deletedJobs } = await supabase.from('jobs').delete()
        .eq('tenant_id', tenantId).in('status', ['failed', 'stuck'])
        .lt('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()).select('id');
      result = { deleted_jobs: deletedJobs?.length || 0, days_threshold: days };
      break;
    }
  }

  // Update action status
  await supabase.from('ai_actions').update({
    status: success ? 'completed' : 'failed',
    executed_at: new Date().toISOString(),
    result, error_message
  }).eq('id', action_id).eq('tenant_id', tenantId);

  return { success: true, solution_type, result };
});
