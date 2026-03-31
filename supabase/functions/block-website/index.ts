/**
 * block-website - Creates website block rules and distributes to agents
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BlockSchema = z.object({
  url: z.string().min(1),
  reason: z.string().min(1),
  severity: z.string().default('medium'),
  tenant_id: z.string().uuid(),
  agent_ids: z.array(z.string().uuid()).optional(),
});

serveInternal(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = BlockSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { url, reason, severity, tenant_id, agent_ids } = parsed.data;
  logger.info(`[block-website][${requestId}] Blocking URL`, { url, reason });

  const { data: blockRecord, error: blockError } = await supabase
    .from('blocked_websites')
    .insert({ tenant_id, domain_pattern: url, reason, is_active: true })
    .select('id')
    .single();

  if (blockError) throw new Error(`Failed to block website: ${blockError.message}`);

  let agentQuery = supabase
    .from('agents')
    .select('id, agent_name, tenant_id')
    .eq('tenant_id', tenant_id)
    .eq('status', 'active');

  if (agent_ids && agent_ids.length > 0) {
    agentQuery = agentQuery.in('id', agent_ids);
  }

  const { data: targetAgents } = await agentQuery;

  const jobsCreated: string[] = [];
  if (targetAgents && targetAgents.length > 0) {
    // Batch insert all jobs at once instead of N+1
    const jobRows = targetAgents.map(agent => ({
      agent_id: agent.id, agent_name: agent.agent_name, tenant_id: agent.tenant_id,
      type: 'sync_blocked_websites', status: 'pending',
      payload: { action: 'block_website', block_id: blockRecord?.id, url, reason },
      priority: 2,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }));
    const { data: insertedJobs } = await supabase
      .from('jobs')
      .insert(jobRows)
      .select('id');
    if (insertedJobs) jobsCreated.push(...insertedJobs.map(j => j.id));
  }

  await supabase.from('system_alerts').insert({
    tenant_id, alert_type: 'security', severity,
    title: 'Website Blocked',
    message: `Website ${url} blocked: ${reason}`,
    details: { block_id: blockRecord?.id, url, reason, agents_targeted: targetAgents?.length || 0 },
  });

  await supabase.from('domain_events').insert({
    aggregate_id: blockRecord?.id || requestId,
    aggregate_type: 'blocked_website',
    event_type: 'WebsiteBlocked',
    payload: { url, reason, severity, agents_targeted: targetAgents?.length || 0 },
    occurred_on: new Date().toISOString(),
    tenant_id,
  });

  await createAuditLog({
    supabase, tenantId: tenant_id, action: 'block_website',
    resourceType: 'blocked_websites', resourceId: blockRecord?.id,
    details: { url, reason, jobs_created: jobsCreated.length },
    request: req, success: true,
  });

  return {
    success: true, block_id: blockRecord?.id,
    jobs_created: jobsCreated.length, agents_targeted: targetAgents?.length || 0,
  };
});
