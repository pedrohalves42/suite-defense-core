/**
 * Apply Security Patch - Migrated to serveInternal
 * Auth: Internal (cron/service_role)
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const PatchSchema = z.object({
  cve_id: z.string().min(1).max(50),
  agent_ids: z.array(z.string().uuid()).optional(),
  patch_method: z.enum(['automatic', 'manual', 'scheduled']).default('automatic'),
});

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { cve_id, agent_ids, patch_method } = parsed.data;
  logger.info(`[${requestId}] [apply-security-patch] CVE: ${cve_id}, method: ${patch_method}`);

  // Fetch CVE details
  const { data: cve, error: cveError } = await supabase
    .from('cve_database')
    .select('*')
    .eq('cve_id', cve_id)
    .maybeSingle();

  if (cveError || !cve) {
    return new Response(
      JSON.stringify({ error: `CVE ${cve_id} not found` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Find affected agents
  let agentsQuery = supabase
    .from('vuln_findings')
    .select('agent_id, agent_name, tenant_id')
    .eq('cve_id', cve_id)
    .eq('status', 'open');

  if (agent_ids && agent_ids.length > 0) {
    agentsQuery = agentsQuery.in('agent_id', agent_ids);
  }

  const { data: affectedAgents, error: agentsError } = await agentsQuery;
  if (agentsError) throw agentsError;

  if (!affectedAgents || affectedAgents.length === 0) {
    return { success: true, message: 'No affected agents found', cve_id, patched_count: 0 };
  }

  // Create patch jobs for each affected agent
  const jobs = affectedAgents.map(agent => ({
    type: 'apply_security_patch',
    agent_name: agent.agent_name,
    tenant_id: agent.tenant_id,
    status: 'pending',
    payload: {
      cve_id,
      patch_method,
      severity: cve.severity,
      affected_product: cve.affected_products?.[0] || 'unknown',
    },
  }));

  const { error: jobsError } = await supabase.from('jobs').insert(jobs);
  if (jobsError) throw jobsError;

  // Update vuln findings status
  const agentIdsList = affectedAgents.map(a => a.agent_id);
  await supabase
    .from('vuln_findings')
    .update({ status: 'patching' })
    .eq('cve_id', cve_id)
    .in('agent_id', agentIdsList);

  // Audit log
  const tenantIds = [...new Set(affectedAgents.map(a => a.tenant_id))];
  for (const tenantId of tenantIds) {
    await createAuditLog(supabase, {
      tenant_id: tenantId,
      action: 'security_patch_applied',
      entity_type: 'cve',
      entity_id: cve_id,
      details: {
        cve_id,
        patch_method,
        agents_count: affectedAgents.filter(a => a.tenant_id === tenantId).length,
        severity: cve.severity,
      },
    });
  }

  logger.info(`[${requestId}] [apply-security-patch] Created ${jobs.length} patch jobs for CVE ${cve_id}`);

  return {
    success: true,
    cve_id,
    patched_count: jobs.length,
    patch_method,
    severity: cve.severity,
  };
});
