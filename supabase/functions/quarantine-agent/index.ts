/**
 * Quarantine Agent - Migrated to serveInternal middleware
 * Auth: X-Internal-Secret / service_role (internal/cron only)
 */

import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const QuarantineSchema = z.object({
  agent_id: z.string().uuid(),
  quarantine_reason: z.string().min(1).max(1000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  duration_hours: z.number().min(1).max(720).default(24),
  restrict_network: z.boolean().default(true),
  restrict_processes: z.boolean().default(true),
  restrict_file_access: z.boolean().default(true),
});

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  // Validate input
  const parsed = QuarantineSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { agent_id, quarantine_reason, severity, duration_hours, restrict_network, restrict_processes, restrict_file_access } = parsed.data;

  // Validate agent exists
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, agent_name, tenant_id, status')
    .eq('id', agent_id)
    .single();

  if (agentError || !agent) {
    return new Response(
      JSON.stringify({ error: 'Agent not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info('[quarantine-agent] Quarantining agent', {
    requestId, agentId: agent_id, agentName: agent.agent_name, reason: quarantine_reason,
  });

  const quarantineEnd = new Date(Date.now() + duration_hours * 60 * 60 * 1000);

  // Create quarantine record
  const { data: record, error: qError } = await supabase
    .from('agent_quarantine')
    .insert({
      agent_id,
      tenant_id: agent.tenant_id,
      quarantine_reason,
      severity,
      duration_hours,
      restrict_network,
      restrict_processes,
      restrict_file_access,
      quarantined_by: 'system',
      quarantine_end: quarantineEnd.toISOString(),
      status: 'active',
    })
    .select('id')
    .single();

  if (qError) throw new Error(`Failed to create quarantine: ${qError.message}`);

  // Update agent status
  await supabase
    .from('agents')
    .update({ status: 'quarantined', updated_at: new Date().toISOString() })
    .eq('id', agent_id);

  // Cancel pending/queued jobs
  await supabase
    .from('jobs')
    .update({
      status: 'cancelled',
      error_message: `[CANCELLED:AGENT_QUARANTINED] ${quarantine_reason}`,
      completed_at: new Date().toISOString(),
    })
    .eq('agent_id', agent_id)
    .in('status', ['pending', 'queued']);

  // Create system alert
  await supabase.from('system_alerts').insert({
    tenant_id: agent.tenant_id,
    agent_id,
    alert_type: 'quarantine',
    severity,
    title: 'Agent Quarantined',
    message: `Agent "${agent.agent_name}" quarantined: ${quarantine_reason}`,
    details: {
      quarantine_id: record?.id,
      duration_hours,
      restrict_network,
      restrict_processes,
      restrict_file_access,
      quarantine_end: quarantineEnd.toISOString(),
    },
  });

  // Audit log
  await createAuditLog({
    supabase,
    tenantId: agent.tenant_id,
    action: 'quarantine_agent',
    resourceType: 'agents',
    resourceId: agent_id,
    details: { quarantine_reason, severity, duration_hours },
    request: _req,
    success: true,
  });

  // Domain event
  await supabase.from('domain_events').insert({
    aggregate_id: agent_id,
    aggregate_type: 'agent',
    event_type: 'AgentQuarantined',
    payload: { reason: quarantine_reason, severity, duration_hours, quarantine_id: record?.id },
    occurred_on: new Date().toISOString(),
    tenant_id: agent.tenant_id,
  });

  return {
    success: true,
    quarantine_id: record?.id,
    agent_name: agent.agent_name,
    quarantine_end: quarantineEnd.toISOString(),
  };
});
