import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface SyncBlockedBody {
  tenant_id?: string;
}

serveTenant<SyncBlockedBody>(async (_req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  // Fetch all active blocked websites for the tenant
  const { data: blockedSites, error: blockedError } = await supabase
    .from('blocked_websites')
    .select('domain_pattern')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (blockedError) {
    logger.error(`[sync-blocked-websites][${requestId}] Error fetching blocked websites:`, blockedError);
    throw new Error('Failed to fetch blocked websites');
  }

  const blockedDomains = blockedSites?.map(s => s.domain_pattern) || [];
  logger.info(`[sync-blocked-websites][${requestId}] Found ${blockedDomains.length} blocked domains for tenant ${tenantId}`);

  // Fetch all online agents (last heartbeat within 30 minutes)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('id, agent_name')
    .eq('tenant_id', tenantId)
    .gt('last_heartbeat', thirtyMinutesAgo);

  if (agentsError) {
    logger.error(`[sync-blocked-websites][${requestId}] Error fetching agents:`, agentsError);
    throw new Error('Failed to fetch agents');
  }

  if (!agents || agents.length === 0) {
    return {
      success: true,
      message: 'No online agents found',
      jobs_created: 0,
    };
  }

  logger.info(`[sync-blocked-websites][${requestId}] Creating jobs for ${agents.length} online agents`);

  // Cancel existing pending sync jobs
  const agentIds = agents.map(a => a.id);
  const { error: cancelError } = await supabase
    .from('jobs')
    .update({ status: 'cancelled', error_message: 'Superseded by new sync request' })
    .eq('type', 'sync_blocked_websites')
    .eq('tenant_id', tenantId)
    .in('agent_id', agentIds)
    .in('status', ['pending', 'queued', 'delivered']);

  if (cancelError) {
    logger.warn(`[sync-blocked-websites][${requestId}] Error cancelling old jobs:`, cancelError);
  }

  // Create sync jobs
  const jobsToCreate = agents.map(agent => ({
    agent_id: agent.id,
    agent_name: agent.agent_name,
    tenant_id: tenantId,
    type: 'sync_blocked_websites',
    status: 'queued',
    priority: 2,
    approved: true,
    payload: {
      blocked_domains: blockedDomains,
      action: 'sync',
      apply_to_hosts: true,
      flush_dns: true,
      timestamp: new Date().toISOString(),
    },
  }));

  const { data: createdJobs, error: jobsError } = await supabase
    .from('jobs')
    .insert(jobsToCreate)
    .select('id');

  if (jobsError) {
    logger.error(`[sync-blocked-websites][${requestId}] Error creating jobs:`, jobsError);
    throw new Error('Failed to create sync jobs');
  }

  logger.info(`[sync-blocked-websites][${requestId}] Created ${createdJobs?.length || 0} jobs`);

  return {
    success: true,
    message: `Sincronização agendada para ${agents.length} computadores`,
    jobs_created: createdJobs?.length || 0,
    blocked_domains_count: blockedDomains.length,
    agents: agents.map(a => a.agent_name),
  };
});
