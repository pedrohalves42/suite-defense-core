import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('X-Internal-Secret');
    if (!authHeader || authHeader !== internalSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { url, reason, severity = 'medium', tenant_id, agent_ids } = await req.json();

    if (!url || !reason || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'url, reason, and tenant_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[block-website] Blocking URL', { requestId, url, reason });

    // Insert into blocked_websites (uses domain_pattern column)
    const { data: blockRecord, error: blockError } = await supabase
      .from('blocked_websites')
      .insert({
        tenant_id,
        domain_pattern: url,
        reason,
        is_active: true,
      })
      .select('id')
      .single();

    if (blockError) throw new Error(`Failed to block website: ${blockError.message}`);

    // Get target agents for sync
    let agentQuery = supabase
      .from('agents')
      .select('id, agent_name, tenant_id')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active');

    if (agent_ids && agent_ids.length > 0) {
      agentQuery = agentQuery.in('id', agent_ids);
    }

    const { data: targetAgents } = await agentQuery;

    // Create sync jobs for agents
    const jobsCreated: string[] = [];
    for (const agent of targetAgents || []) {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          tenant_id: agent.tenant_id,
          type: 'sync_blocked_websites',
          status: 'pending',
          payload: { action: 'block_website', block_id: blockRecord?.id, url, reason },
          priority: 2,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (!jobError && job) jobsCreated.push(job.id);
    }

    // Alert
    await supabase.from('system_alerts').insert({
      tenant_id,
      alert_type: 'security',
      severity,
      title: 'Website Blocked',
      message: `Website ${url} blocked: ${reason}`,
      details: { block_id: blockRecord?.id, url, reason, agents_targeted: targetAgents?.length || 0 },
    });

    // Domain event
    await supabase.from('domain_events').insert({
      aggregate_id: blockRecord?.id || requestId,
      aggregate_type: 'blocked_website',
      event_type: 'WebsiteBlocked',
      payload: { url, reason, severity, agents_targeted: targetAgents?.length || 0 },
      occurred_on: new Date().toISOString(),
      tenant_id,
    });

    // Audit
    await createAuditLog({
      supabase,
      tenantId: tenant_id,
      action: 'block_website',
      resourceType: 'blocked_websites',
      resourceId: blockRecord?.id,
      details: { url, reason, jobs_created: jobsCreated.length },
      request: req,
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        block_id: blockRecord?.id,
        jobs_created: jobsCreated.length,
        agents_targeted: targetAgents?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'block-website');
  }
});
