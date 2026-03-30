import { logger } from '../../_shared/logger.ts';
import {
  isProcessProtected,
  isServiceProtected
} from '../../_shared/protected-targets.ts';
import type { PlaybookAction, ActionContext } from '../types.ts';

/** Fetch agent with offline warning */
async function fetchAgentWithWarning(
  ctx: ActionContext,
  actionType: string
): Promise<{ agent_name: string; status: string; last_heartbeat: string | null }> {
  const { supabase, agentId, tenantId } = ctx;
  if (!agentId) throw new Error(`Agent ID required for ${actionType} action`);

  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name, status, last_heartbeat')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .single();

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  if (agent.last_heartbeat) {
    const diffMins = (Date.now() - new Date(agent.last_heartbeat).getTime()) / 60_000;
    if (diffMins > 5) {
      logger.warn(`[execute-playbook-action] Agent ${agentId} may be offline (${diffMins.toFixed(1)} min ago). Job will be queued.`);
    }
  }

  return agent;
}

/** Create a job and its audit log */
async function createJobWithAudit(
  ctx: ActionContext,
  agent: { agent_name: string; status: string },
  jobType: string,
  jobPayload: Record<string, unknown>,
  auditAction: string,
  auditDetails: Record<string, unknown>
): Promise<string | undefined> {
  const { supabase, tenantId, agentId, userId, executionId, playbookSnapshot } = ctx;

  const { data: job } = await supabase
    .from('jobs')
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      agent_name: agent.agent_name,
      type: jobType,
      status: 'queued',
      approved: true,
      payload: {
        ...jobPayload,
        triggered_by: 'playbook',
        playbook_execution_id: executionId,
        playbook_version: playbookSnapshot.version,
      },
    })
    .select('id')
    .single();

  await supabase.from('audit_logs').insert({
    user_id: userId,
    tenant_id: tenantId,
    action: auditAction,
    resource_type: 'job',
    resource_id: job?.id,
    success: true,
    details: {
      agent_id: agentId,
      agent_status: agent.status,
      ...auditDetails,
      triggered_by: 'playbook',
      playbook_execution_id: executionId,
    },
  });

  return job?.id;
}

export async function handleKillProcess(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const agent = await fetchAgentWithWarning(ctx, 'kill_process');
  const processName = (ctx.triggerContext.process_name as string) ||
    (action.action_payload.process_name as string) || 'unknown';

  if (isProcessProtected(processName)) {
    throw new Error(`Protected process cannot be killed: ${processName}`);
  }

  const jobId = await createJobWithAudit(
    ctx, agent, 'kill_process',
    { process_name: processName, use_force: action.action_payload.use_force !== false },
    'kill_process',
    { process_name: processName }
  );

  logger.info(`[execute-playbook-action] Created kill_process job for ${processName}`);
  return { job_id: jobId, process_name: processName };
}

export async function handleStopService(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const agent = await fetchAgentWithWarning(ctx, 'stop_service');
  const serviceName = (ctx.triggerContext.service_name as string) ||
    (action.action_payload.service_name as string) || 'unknown';

  if (isServiceProtected(serviceName)) {
    throw new Error(`Protected service cannot be stopped: ${serviceName}`);
  }

  const jobId = await createJobWithAudit(
    ctx, agent, 'stop_service',
    { service_name: serviceName },
    'stop_service',
    { service_name: serviceName }
  );

  logger.info(`[execute-playbook-action] Created stop_service job for ${serviceName}`);
  return { job_id: jobId, service_name: serviceName };
}

export async function handleDisableService(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const agent = await fetchAgentWithWarning(ctx, 'disable_service');
  const serviceName = (ctx.triggerContext.service_name as string) ||
    (action.action_payload.service_name as string) || 'unknown';

  if (isServiceProtected(serviceName)) {
    throw new Error(`Protected service cannot be disabled: ${serviceName}`);
  }

  const jobId = await createJobWithAudit(
    ctx, agent, 'disable_service',
    { service_name: serviceName },
    'disable_service',
    { service_name: serviceName }
  );

  logger.info(`[execute-playbook-action] Created disable_service job for ${serviceName}`);
  return { job_id: jobId, service_name: serviceName };
}

export async function handleRestartService(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const agent = await fetchAgentWithWarning(ctx, 'restart_service');
  const serviceName = (ctx.triggerContext.service_name as string) ||
    (action.action_payload.service_name as string) || 'CyberShieldAgent';

  if (isServiceProtected(serviceName)) {
    logger.warn(`[execute-playbook-action] Warning: restarting protected service ${serviceName}`);
  }

  const jobId = await createJobWithAudit(
    ctx, agent, 'restart_service',
    { service_name: serviceName },
    'restart_service',
    { service_name: serviceName }
  );

  logger.info(`[execute-playbook-action] Created restart_service job for ${serviceName}`);
  return { job_id: jobId, service_name: serviceName };
}

export async function handleIsolate(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const { supabase, agentId, tenantId, executionId, playbookSnapshot } = ctx;
  if (!agentId) throw new Error('Agent ID required for isolation');

  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .single();

  const payload = action.action_payload;

  const { data: job } = await supabase
    .from('jobs')
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      agent_name: agent?.agent_name,
      type: 'network_isolate',
      status: 'queued',
      approved: true,
      payload: {
        isolation_level: payload.isolation_level || 'network',
        allow_cybershield: payload.allow_cybershield !== false,
        triggered_by: 'playbook',
        playbook_execution_id: executionId,
        playbook_version: playbookSnapshot.version,
      },
    })
    .select('id')
    .single();

  await supabase
    .from('agents')
    .update({ status: 'isolated' })
    .eq('id', agentId)
    .eq('tenant_id', tenantId);

  return { job_id: job?.id, isolation_level: payload.isolation_level };
}

export async function handleCreateJob(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const { supabase, agentId, tenantId, executionId, playbookSnapshot } = ctx;
  if (!agentId) throw new Error('Agent ID required for job creation');

  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name')
    .eq('id', agentId)
    .single();

  const payload = action.action_payload;
  const jobType = (payload.job_type as string) || 'diagnostic_full';

  const { data: job } = await supabase
    .from('jobs')
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      agent_name: agent?.agent_name,
      type: jobType,
      status: 'queued',
      approved: true,
      payload: {
        verbose: payload.verbose === true,
        priority: payload.priority || 'normal',
        triggered_by: 'playbook',
        playbook_execution_id: executionId,
        playbook_version: playbookSnapshot.version,
      },
    })
    .select('id')
    .single();

  return { job_id: job?.id, job_type: jobType };
}
