import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashToken } from '../_shared/token-hash.ts';
import { normalizeEvidenceEntry } from './normalization.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token',
};

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

    let rawEntries: Record<string, unknown>[];
    if (Array.isArray(body.entries) && body.entries.length > 0) {
      rawEntries = body.entries.slice(0, 100) as Record<string, unknown>[];
    } else if (body.event_type || body.event_name) {
      rawEntries = [body as Record<string, unknown>];
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing or empty entries array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEntries = await Promise.all(
      rawEntries.map((entry) =>
        normalizeEvidenceEntry(entry, {
          agent_name: typeof body.agent_name === 'string' ? body.agent_name : agentsData.agent_name,
          agent_version: typeof body.agent_version === 'string' ? body.agent_version : null,
        })
      )
    );

    const records = normalizedEntries.map((entry) => ({
      tenant_id: agentsData.tenant_id,
      agent_id: agentsData.id,
      agent_name: entry.agent_name,
      agent_version: entry.agent_version,
      event_type: entry.event_type,
      event_data: entry.event_data,
      evidence_hash: entry.evidence_hash,
      state_before: entry.state_before,
      state_after: entry.state_after,
      severity: entry.severity,
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from('agent_evidence_logs')
      .insert(records)
      .select('id');

    if (insertError) {
      logger.error('[submit-agent-evidence] Insert error:', insertError.message);
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
    logger.error('[submit-agent-evidence] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
