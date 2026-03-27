import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  // Admin check
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', userId);

  const adminRole = roles?.find(r => ['admin', 'super_admin'].includes(r.role) && r.tenant_id === tenantId);
  if (!adminRole) {
    return new Response(
      JSON.stringify({ error: 'Requires admin role' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { agent_names, target_version } = body || {};

  let agentsToReinstall: { id: string; agent_name: string; agent_version: string | null; tenant_id: string }[] = [];

  if (agent_names && Array.isArray(agent_names) && agent_names.length > 0) {
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, agent_name, agent_version, tenant_id')
      .in('agent_name', agent_names)
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (agentsError) throw agentsError;
    agentsToReinstall = agents || [];
  } else {
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, agent_name, agent_version, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (agentsError) throw agentsError;

    agentsToReinstall = (agents || []).filter(agent => {
      if (!agent.agent_version) return true;
      const version = agent.agent_version.replace(/^v/, '');
      const targetV = (target_version || 'v3.10.24').replace(/^v/, '');
      const vParts = version.split('.').map(Number);
      const tParts = targetV.split('.').map(Number);
      for (let i = 0; i < Math.max(vParts.length, tParts.length); i++) {
        const v = vParts[i] || 0;
        const t = tParts[i] || 0;
        if (v < t) return true;
        if (v > t) return false;
      }
      return false;
    });
  }

  if (agentsToReinstall.length === 0) {
    return { success: true, message: 'No agents need reinstallation', jobs_created: 0 };
  }

  // ADR-VELLUM V-310: Blast radius governance
  const { data: blastCheck, error: blastError } = await supabase
    .rpc('check_blast_radius' as any, {
      p_tenant_id: tenantId,
      p_action_type: 'force_update_agents',
      p_affected_count: agentsToReinstall.length,
    });

  if (blastError) {
    logger.error(`[${requestId}] Blast radius check failed`, blastError);
    return new Response(
      JSON.stringify({ error: 'BLAST_RADIUS_CHECK_FAILED', message: blastError.message, requestId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!blastCheck?.allowed) {
    logger.warn(`[${requestId}] Blast radius exceeded`);
    return new Response(
      JSON.stringify({
        error: 'BLAST_RADIUS_EXCEEDED',
        requested: agentsToReinstall.length,
        affected_percent: blastCheck?.affected_percent,
        max_allowed_percent: blastCheck?.max_allowed_percent,
        requires_approval: blastCheck?.requires_approval,
        message: blastCheck?.message || 'Blast radius exceeded',
        requestId,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const jobsToCreate = agentsToReinstall.map(agent => ({
    agent_id: agent.id,
    agent_name: agent.agent_name,
    tenant_id: agent.tenant_id,
    type: 'reinstall_agent',
    status: 'queued',
    payload: { target_version: target_version || 'v3.10.24-SMART-UPDATE', reason: 'bootstrap_problem_fix' },
    approved: true,
    created_by: userId,
  }));

  const { data: createdJobs, error: createError } = await supabase
    .from('jobs')
    .insert(jobsToCreate)
    .select('id, agent_name');

  if (createError) throw createError;

  logger.info(`[${requestId}] Jobs created: ${createdJobs?.length || 0}`);

  return {
    success: true,
    jobs_created: createdJobs?.length || 0,
    agents: agentsToReinstall.map(a => ({ agent_name: a.agent_name, current_version: a.agent_version })),
    jobs: createdJobs,
  };
}, { methods: ['POST'] });
