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
    const {
      agent_id,
      quarantine_reason,
      severity = 'high',
      duration_hours = 24,
      restrict_network = true,
      restrict_processes = true,
      restrict_file_access = true,
    } = await req.json();

    if (!agent_id || !quarantine_reason) {
      return new Response(
        JSON.stringify({ error: 'agent_id and quarantine_reason are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate agent exists
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id, status')
      .eq('id', agent_id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[quarantine-agent] Quarantining agent', {
      requestId,
      agentId: agent_id,
      agentName: agent.agent_name,
      reason: quarantine_reason,
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

    // Update agent status to quarantined
    await supabase
      .from('agents')
      .update({ status: 'quarantined', updated_at: new Date().toISOString() })
      .eq('id', agent_id);

    // Cancel all pending/queued jobs for this agent
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
      request: req,
      success: true,
    });

    // Dispatch domain event
    await supabase.from('domain_events').insert({
      aggregate_id: agent_id,
      aggregate_type: 'agent',
      event_type: 'AgentQuarantined',
      payload: { reason: quarantine_reason, severity, duration_hours, quarantine_id: record?.id },
      occurred_on: new Date().toISOString(),
      tenant_id: agent.tenant_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        quarantine_id: record?.id,
        agent_name: agent.agent_name,
        quarantine_end: quarantineEnd.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'quarantine-agent');
  }
});
