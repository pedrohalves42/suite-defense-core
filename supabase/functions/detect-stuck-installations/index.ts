import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Detect stuck installations cron job started`);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Query v_agent_lifecycle_state for stuck agents
    const { data: stuckAgents, error: queryError } = await supabaseClient
      .from("v_agent_lifecycle_state")
      .select("*")
      .eq("is_stuck", true);

    if (queryError) {
      console.error(`[${requestId}] Error querying stuck agents:`, queryError);
      throw queryError;
    }

    console.log(`[${requestId}] Found ${stuckAgents?.length || 0} stuck agents`);

    if (!stuckAgents || stuckAgents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No stuck agents detected",
          stuck_count: 0,
          request_id: requestId
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      );
    }

    // Group stuck agents by tenant
    const stuckByTenant = stuckAgents.reduce((acc: any, agent: any) => {
      if (!acc[agent.tenant_id]) {
        acc[agent.tenant_id] = [];
      }
      acc[agent.tenant_id].push(agent);
      return acc;
    }, {});

    const alertsCreated = [];
    const emailsSent = [];

    // Process each tenant
    for (const [tenantId, agents] of Object.entries(stuckByTenant)) {
      const agentList = agents as any[];
      
      // Get tenant info and admin emails
      const { data: tenant, error: tenantError } = await supabaseClient
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .single();

      if (tenantError) {
        console.error(`[${requestId}] Error fetching tenant ${tenantId}:`, tenantError);
        continue;
      }

      // Get admin emails for this tenant
      const { data: adminRoles, error: adminError } = await supabaseClient
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "admin");

      if (adminError || !adminRoles || adminRoles.length === 0) {
        console.error(`[${requestId}] No admins found for tenant ${tenantId}`);
        continue;
      }

      const adminUserIds = adminRoles.map(r => r.user_id);

      const { data: adminProfiles, error: profileError } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .in("user_id", adminUserIds);

      if (profileError || !adminProfiles || adminProfiles.length === 0) {
        console.error(`[${requestId}] No admin profiles found for tenant ${tenantId}`);
        continue;
      }

      // Get auth users to get emails
      const { data: { users }, error: usersError } = await supabaseClient.auth.admin.listUsers();
      
      if (usersError || !users) {
        console.error(`[${requestId}] Error fetching users:`, usersError);
        continue;
      }

      const adminEmails = users
        .filter(u => adminUserIds.includes(u.id))
        .map(u => u.email)
        .filter(e => e) as string[];

      if (adminEmails.length === 0) {
        console.error(`[${requestId}] No admin emails found for tenant ${tenantId}`);
        continue;
      }

      // Create system alert
      const { data: alert, error: alertError } = await supabaseClient
        .from("system_alerts")
        .insert({
          tenant_id: tenantId,
          alert_type: "stuck_installations",
          severity: "high",
          title: `${agentList.length} instalação(ões) travada(s)`,
          message: `${agentList.length} agente(s) com comando copiado há mais de 30 minutos sem conclusão`,
          details: {
            stuck_agents: agentList.map(a => ({
              agent_name: a.agent_name,
              command_copied_at: a.command_copied_at,
              minutes_since_copy: a.minutes_between_copy_and_install,
              platform: a.platform
            })),
            detected_at: new Date().toISOString(),
            request_id: requestId
          }
        })
        .select()
        .single();

      if (alertError) {
        console.error(`[${requestId}] Error creating alert for tenant ${tenantId}:`, alertError);
      } else {
        alertsCreated.push(alert);
      }

      // Send email alert
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn(`[${requestId}] RESEND_API_KEY not configured, skipping email`);
        continue;
      }

      const resend = new Resend(resendApiKey);

      const emailHtml = `
        <h2>⚠️ Instalações Travadas Detectadas - ${tenant.name}</h2>
        <p><strong>${agentList.length}</strong> agente(s) estão com instalação travada há mais de 30 minutos:</p>
        <ul>
          ${agentList.map(a => `
            <li>
              <strong>${a.agent_name}</strong> (${a.platform})<br/>
              Comando copiado em: ${new Date(a.command_copied_at).toLocaleString('pt-BR')}<br/>
              Tempo decorrido: ~${Math.round(a.minutes_between_copy_and_install || 0)} minutos
            </li>
          `).join('')}
        </ul>
        <p>Possíveis causas:</p>
        <ul>
          <li>Script não foi executado</li>
          <li>Erro de autenticação (401)</li>
          <li>Problemas de TLS/Proxy</li>
          <li>Firewall bloqueando conexão</li>
        </ul>
        <p>Acesse o dashboard para mais detalhes.</p>
        <hr/>
        <small>Request ID: ${requestId} | Tenant: ${tenant.name}</small>
      `;

      try {
        const emailResult = await resend.emails.send({
          from: "CyberShield Alerts <alerts@cybershield.com>",
          to: adminEmails,
          subject: `⚠️ ${agentList.length} Instalação(ões) Travada(s) - ${tenant.name}`,
          html: emailHtml
        });

        console.log(`[${requestId}] Email sent to ${adminEmails.length} admin(s) for tenant ${tenantId}`);
        if (emailResult.data?.id) {
          emailsSent.push({ tenant_id: tenantId, email_id: emailResult.data.id });
        }

        // Update alert with email_sent flag
        if (alert) {
          await supabaseClient
            .from("system_alerts")
            .update({
              email_sent: true,
              email_sent_at: new Date().toISOString()
            })
            .eq("id", alert.id);
        }
      } catch (emailError) {
        console.error(`[${requestId}] Error sending email for tenant ${tenantId}:`, emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stuck_count: stuckAgents.length,
        tenants_affected: Object.keys(stuckByTenant).length,
        alerts_created: alertsCreated.length,
        emails_sent: emailsSent.length,
        request_id: requestId
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: requestId
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
