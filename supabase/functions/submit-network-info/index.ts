import { requireEnv } from '../_shared/env.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hashToken } from '../_shared/token-hash.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce',
};

interface NetworkInfoPayload {
  firewall_domain: boolean | null;
  firewall_private: boolean | null;
  firewall_public: boolean | null;
  open_ports: { port: number; process: string; protocol: string }[];
  active_connections: { remote_address: string; remote_port: number; state: string }[];
  network_adapters: { name: string; ip_address: string; mac_address: string; status: string }[];
  dns_servers: string[];
  gateway_ip: string | null;
  public_ip: string | null;
  dns_test_success: boolean | null;
  https_test_success: boolean | null;
}

serve(async (req) => {
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
    const agentToken = req.headers.get('x-agent-token');
    
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Missing agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate agent token via hash (P0 security fix)
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, tenant_id, agent_name)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.error('Invalid agent token:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = tokenData.agent_id;
    const tenantId = (tokenData.agents as Record<string, unknown>).tenant_id;

    const payload: NetworkInfoPayload = await req.json();

    // Insert network info
    const { error: insertError } = await supabase
      .from('agent_network_info')
      .insert({
        agent_id: agentId,
        tenant_id: tenantId,
        firewall_domain: payload.firewall_domain,
        firewall_private: payload.firewall_private,
        firewall_public: payload.firewall_public,
        open_ports: payload.open_ports || [],
        active_connections: (payload.active_connections || []).slice(0, 100), // Limit connections
        network_adapters: payload.network_adapters || [],
        dns_servers: payload.dns_servers || [],
        gateway_ip: payload.gateway_ip,
        public_ip: payload.public_ip,
        dns_test_success: payload.dns_test_success,
        https_test_success: payload.https_test_success,
        collected_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.error('Error inserting network info:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save network info' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean up old records (keep last 10)
    await supabase
      .from('agent_network_info')
      .delete()
      .eq('agent_id', agentId)
      .lt('collected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    logger.info(`Network info saved for agent ${agentId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Error in submit-network-info:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
