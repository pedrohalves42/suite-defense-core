/**
 * Block Website - Migrated to assertInternalCaller
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const parsed = BlockSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const { url, reason, severity, tenant_id, agent_ids } = parsed.data;
    logger.info('[block-website] Blocking URL', { requestId, url, reason });

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
    for (const agent of targetAgents || []) {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          agent_id: agent.id, agent_name: agent.agent_name, tenant_id: agent.tenant_id,
          type: 'sync_blocked_websites', status: 'pending',
          payload: { action: 'block_website', block_id: blockRecord?.id, url, reason },
          priority: 2,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (!jobError && job) jobsCreated.push(job.id);
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

    return new Response(
      JSON.stringify({
        success: true, block_id: blockRecord?.id,
        jobs_created: jobsCreated.length, agents_targeted: targetAgents?.length || 0,
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'block-website');
  }
});
