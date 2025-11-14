import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Resend } from 'npm:resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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

    // Create system alerts and send emails for each tenant
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

      // Get tenant info and admin emails
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, owner_user_id')
        .eq('id', tenantId)
        .single();

      const { data: adminUsers } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(full_name)')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin');

      // Get admin emails from auth.users
      const adminEmails: string[] = [];
      if (adminUsers) {
        for (const admin of adminUsers) {
          const { data: authUser } = await supabase.auth.admin.getUserById(admin.user_id);
          if (authUser.user?.email) {
            adminEmails.push(authUser.user.email);
          }
        }
      }

      // Filter agents pending for more than 30 minutes
      const agentsPending30Min = agentsList.filter(a => {
        const minutesPending = Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60);
        return minutesPending >= 30;
      });

      // Create alert
      const { data: insertedAlert, error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          alert_type: 'pending_agents',
          severity: agentsPending30Min.length > 0 ? 'high' : 'medium',
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
        })
        .select()
        .single();

      if (alertError) {
        console.error('[check-pending-agents] Error creating alert:', alertError);
      } else {
        notifications.push({
          tenant_id: tenantId,
          agents_count: agentsList.length,
          agents: agentsList.map(a => a.agent_name)
        });

        // Send email if agents are pending for more than 30 minutes
        if (agentsPending30Min.length > 0 && adminEmails.length > 0) {
          const agentList = agentsPending30Min
            .map(a => {
              const mins = Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60);
              return `• ${a.agent_name} (pendente há ${mins} minutos)`;
            })
            .join('\n');

          try {
            await resend.emails.send({
              from: 'CyberShield Alerts <alerts@resend.dev>',
              to: adminEmails,
              subject: `⚠️ ${agentsPending30Min.length} agente(s) pendente(s) há mais de 30 minutos`,
              html: `
                <h1>Alerta: Agentes Pendentes de Instalação</h1>
                <p>Os seguintes agentes foram gerados mas ainda não executaram seus instaladores:</p>
                <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
${agentList}
                </pre>
                <p><strong>Recomendação:</strong> Verifique se os instaladores foram executados corretamente nos servidores Windows.</p>
                <p>Acesse o painel de administração para mais detalhes.</p>
              `,
            });

            // Update alert to mark email as sent
            await supabase
              .from('system_alerts')
              .update({
                email_sent: true,
                email_sent_at: new Date().toISOString()
              })
              .eq('id', insertedAlert.id);

            console.log(`[check-pending-agents] Email sent to ${adminEmails.length} admin(s) for tenant ${tenantId}`);
          } catch (emailError) {
            console.error('[check-pending-agents] Error sending email:', emailError);
          }
        }
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
