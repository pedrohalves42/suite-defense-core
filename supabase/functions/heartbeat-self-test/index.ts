import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashToken } from '../_shared/token-hash.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Heartbeat Self-Test Endpoint
 * 
 * Allows agents to verify that their heartbeats are being received by the backend.
 * This enables detection of silent communication failures where the agent thinks
 * it's sending heartbeats but the backend isn't receiving them.
 * 
 * GET /heartbeat-self-test
 * Headers: X-Agent-Token (required)
 * Response: { agent_id, agent_name, last_heartbeat, server_time }
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get agent token from header
    const agentToken = req.headers.get('X-Agent-Token');
    
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Missing X-Agent-Token header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Hash the token to compare with stored hash
    const tokenHash = await hashToken(agentToken);

    // Look up agent by token hash
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id, last_heartbeat, status, agent_version')
      .eq('token_hash', tokenHash)
      .eq('status', 'active')
      .maybeSingle();

    if (agentError) {
      console.error('[SelfTest] Database error:', agentError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!agent) {
      return new Response(
        JSON.stringify({ error: 'Agent not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serverTime = new Date().toISOString();
    const lastHeartbeat = agent.last_heartbeat;
    
    // Calculate time since last heartbeat
    let secondsSinceHeartbeat: number | null = null;
    let status: 'ok' | 'stale' | 'critical' = 'ok';
    
    if (lastHeartbeat) {
      const lastHeartbeatDate = new Date(lastHeartbeat);
      secondsSinceHeartbeat = Math.floor((Date.now() - lastHeartbeatDate.getTime()) / 1000);
      
      // Determine status based on staleness
      if (secondsSinceHeartbeat > 600) { // > 10 minutes
        status = 'critical';
      } else if (secondsSinceHeartbeat > 300) { // > 5 minutes
        status = 'stale';
      }
    } else {
      status = 'critical'; // No heartbeat ever recorded
    }

    const response = {
      agent_id: agent.id,
      agent_name: agent.agent_name,
      agent_version: agent.agent_version,
      last_heartbeat: lastHeartbeat,
      server_time: serverTime,
      seconds_since_heartbeat: secondsSinceHeartbeat,
      status: status,
      message: status === 'ok' 
        ? 'Heartbeats are being received normally'
        : status === 'stale'
        ? 'Last heartbeat is older than expected'
        : 'Heartbeat data is critically stale or missing'
    };

    console.log(`[SelfTest] Agent ${agent.agent_name} checked - status: ${status}, seconds: ${secondsSinceHeartbeat}`);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        } 
      }
    );

  } catch (error: unknown) {
    console.error('[SelfTest] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
