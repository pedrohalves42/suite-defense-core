/**
 * Apply Security Patch - Cleaned up to use assertInternalCaller + Zod validation
 * Auth: X-Internal-Secret (internal/cron only)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { handleException } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const PatchSchema = z.object({
  cve_id: z.string().min(1).max(50),
  agent_ids: z.array(z.string().uuid()).optional(),
  patch_method: z.enum(['automatic', 'manual', 'scheduled']).default('automatic'),
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();

  try {
    // Auth: internal only
    const authError = await assertInternalCaller(req);
    if (authError) return authError;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate input
    const rawBody = await req.json();
    const parsed = PatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const { cve_id, agent_ids, patch_method } = parsed.data;

    logger.info('[apply-security-patch] Starting patch deployment', { requestId, cve_id, patch_method });

    // Get CVE details
    const { data: cve } = await supabase
      .from('cve_database')
      .select('*')
      .eq('cve_id', cve_id)
      .single();

    // Find vulnerable agents
    let query = supabase
      .from('agent_vulnerabilities')
      .select('agent_id')
      .eq('cve_id', cve_id)
      .eq('remediation_status', 'pending');

    if (agent_ids && agent_ids.length > 0) {
      query = query.in('agent_id', agent_ids);
    }

    const { data: vulnAgents } = await query;

    if (!vulnAgents || vulnAgents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No vulnerable agents found', agents_patched: 0 }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const agentIdList = vulnAgents.map(v => v.agent_id);

    // Get active agent details
    const { data: agents } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id')
      .in('id', agentIdList)
      .eq('status', 'active');

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active vulnerable agents', agents_patched: 0 }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Create remediation jobs
    const jobsCreated: string[] = [];
    for (const agent of agents) {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          tenant_id: agent.tenant_id,
          type: 'service_health_check',
          status: 'pending',
          payload: {
            action: 'apply_security_patch',
            cve_id,
            patch_method,
            cve_details: cve ? { severity: cve.severity, cvss_score: cve.cvss_score } : null,
          },
          priority: 1,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (!jobError && job) jobsCreated.push(job.id);
    }

    // Update vulnerability status
    await supabase
      .from('agent_vulnerabilities')
      .update({
        remediation_status: 'remediating',
        remediation_started_at: new Date().toISOString(),
      })
      .eq('cve_id', cve_id)
      .in('agent_id', agentIdList);

    const tenantId = agents[0]?.tenant_id;

    // Create alert
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      alert_type: 'security_patch',
      severity: 'high',
      title: 'Security Patch Deployment',
      message: `Deploying patch for ${cve_id} to ${agents.length} agents`,
      details: { cve_id, agents_targeted: agents.length, jobs_created: jobsCreated.length, patch_method },
    });

    // Domain event
    await supabase.from('domain_events').insert({
      aggregate_id: cve_id,
      aggregate_type: 'security_patch',
      event_type: 'SecurityPatchDeployed',
      payload: { cve_id, agents_targeted: agents.length, jobs_created: jobsCreated.length, patch_method },
      occurred_on: new Date().toISOString(),
      tenant_id: tenantId,
    });

    // Audit
    await createAuditLog({
      supabase,
      tenantId,
      action: 'deploy_security_patch',
      resourceType: 'cve_database',
      resourceId: cve_id,
      details: { agents_targeted: agents.length, jobs_created: jobsCreated.length },
      request: req,
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        cve_id,
        agents_patched: agents.length,
        jobs_created: jobsCreated.length,
        patch_method,
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'apply-security-patch');
  }
});
