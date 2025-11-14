import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PendingAgent {
  id: string;
  agent_name: string;
  enrolled_at: string;
  tenant_id: string;
  last_heartbeat: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[check-pending-agents] Starting check...');

    // Find agents that are:
    // 1. Status = 'pending' or 'active' but no heartbeat
    // 2. Created > 10 minutes ago
    // 3. No 'post_installation' event in installation_analytics
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, agent_name, enrolled_at, tenant_id, last_heartbeat')
      .is('last_heartbeat', null)
      .lt('enrolled_at', tenMinutesAgo)
      .order('enrolled_at', { ascending: false })
      .limit(100);

    if (agentsError) {
      console.error('[check-pending-agents] Error fetching agents:', agentsError);
      throw agentsError;
    }

    if (!agents || agents.length === 0) {
      console.log('[check-pending-agents] No pending agents found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending agents',
          count: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[check-pending-agents] Found ${agents.length} agents without heartbeat`);

    // Check which ones don't have post_installation event
    const agentIds = agents.map(a => a.id);
    const { data: installations, error: installError } = await supabase
      .from('installation_analytics')
      .select('agent_id')
      .in('agent_id', agentIds)
      .eq('event_type', 'post_installation');

    if (installError) {
      console.error('[check-pending-agents] Error checking installations:', installError);
    }

    const installedAgentIds = new Set(installations?.map(i => i.agent_id) || []);
    const notInstalledAgents = agents.filter(a => !installedAgentIds.has(a.id));

    console.log(`[check-pending-agents] ${notInstalledAgents.length} agents not yet installed`);

    if (notInstalledAgents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All agents have installation events',
          count: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by tenant for notifications
    const tenantGroups = notInstalledAgents.reduce((acc, agent) => {
      if (!acc[agent.tenant_id]) {
        acc[agent.tenant_id] = [];
      }
      acc[agent.tenant_id].push(agent);
      return acc;
    }, {} as Record<string, PendingAgent[]>);

    const notifications: any[] = [];

    // Create system alerts for each tenant
    for (const [tenantId, agentsList] of Object.entries(tenantGroups)) {
      // Check if we already sent an alert in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentAlert } = await supabase
        .from('system_alerts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('alert_type', 'pending_agents')
        .gte('created_at', oneHourAgo)
        .maybeSingle();

      if (recentAlert) {
        console.log(`[check-pending-agents] Alert already sent for tenant ${tenantId} in last hour`);
        continue;
      }

      // Create alert
      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          alert_type: 'pending_agents',
          severity: 'medium',
          title: `${agentsList.length} agente(s) pendente(s) de instalação`,
          message: `Os seguintes agentes foram gerados mas ainda não foram executados: ${agentsList.map(a => a.agent_name).join(', ')}`,
          details: {
            agents: agentsList.map(a => ({
              id: a.id,
              name: a.agent_name,
              enrolled_at: a.enrolled_at,
              minutes_pending: Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60)
            })),
            recommendation: 'Verifique se os instaladores foram executados corretamente nos servidores Windows.'
          },
          acknowledged: false,
          resolved: false
        });

      if (alertError) {
        console.error('[check-pending-agents] Error creating alert:', alertError);
      } else {
        notifications.push({
          tenant_id: tenantId,
          agents_count: agentsList.length,
          agents: agentsList.map(a => a.agent_name)
        });
      }
    }

    console.log(`[check-pending-agents] Created ${notifications.length} notifications`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Checked ${agents.length} agents, created ${notifications.length} alerts`,
        total_agents: agents.length,
        not_installed: notInstalledAgents.length,
        notifications 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-pending-agents] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
