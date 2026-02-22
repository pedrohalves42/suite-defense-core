import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashToken } from '../_shared/token-hash.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token',
};

interface EvidenceEntry {
  event_type: string;
  event_data: Record<string, unknown>;
  evidence_hash: string;
  state_before?: string;
  state_after?: string;
  severity?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const agentToken = req.headers.get('x-agent-token');
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Missing agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenHash = await hashToken(agentToken);
    
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, tenant_id, agent_name)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const agentsData = tokenData.agents as unknown as { id: string; tenant_id: string; agent_name: string };
    const body = await req.json();

    // Support both formats: { entries: [...] } (batch) and flat { event_type, event_data } (auto-repair telemetry)
    let entries: EvidenceEntry[];
    if (body.entries && Array.isArray(body.entries) && body.entries.length > 0) {
      entries = body.entries.slice(0, 100);
    } else if (body.event_type || body.event_name) {
      // Flat format from Send-AutoRepairTelemetry: convert to entries array
      entries = [{
        event_type: body.event_type || 'auto_repair',
        event_data: {
          event_name: body.event_name,
          ...(body.event_data || {}),
          hostname: body.hostname,
          timestamp: body.timestamp,
        },
        evidence_hash: body.evidence_hash || 'auto_repair_telemetry',
        severity: body.severity || 'info',
      }];
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing or empty entries array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validEventTypes = ['state_change', 'job_execution', 'dns_block', 'policy_sync', 'auto_recovery', 'heartbeat', 'update_applied', 'error', 'policy_drift', 'security_event', 'auto_repair'];
    const validSeverities = ['debug', 'info', 'warning', 'error', 'critical'];

    const records = entries.map(entry => ({
      tenant_id: agentsData.tenant_id,
      agent_id: agentsData.id,
      agent_name: body.agent_name || agentsData.agent_name,
      agent_version: body.agent_version || null,
      event_type: validEventTypes.includes(entry.event_type) ? entry.event_type : 'security_event',
      event_data: entry.event_data || {},
      evidence_hash: entry.evidence_hash || 'hash_not_provided',
      state_before: entry.state_before || null,
      state_after: entry.state_after || null,
      severity: validSeverities.includes(entry.severity || '') ? entry.severity : 'info'
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from('agent_evidence_logs')
      .insert(records)
      .select('id');

    if (insertError) {
      console.error('[submit-agent-evidence] Insert error:', insertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to store evidence' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        stored_count: insertedData?.length || records.length,
        agent_name: agentsData.agent_name
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[submit-agent-evidence] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
