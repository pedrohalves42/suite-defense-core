import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1139: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  console.log(`[${requestId}] Detect stuck installations cron job started`);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Query v_agent_lifecycle_state for stuck agents (is_stuck is now available in the view)
    const { data: stuckAgents, error: queryError } = await supabaseClient
      .from("v_agent_lifecycle_state")
      .select("agent_id, tenant_id, agent_name, agent_state, last_heartbeat, lifecycle_status, is_stuck")
      .eq("is_stuck", true);

    if (queryError) {
      console.error(`[${requestId}] Error querying stuck agents:`, queryError);
      
      // Log failure with observability
      await supabaseClient.rpc('log_scheduled_job_run', {
        p_job_key: 'detect-stuck-installations',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: queryError.message,
        p_result: { error: queryError.message },
        p_processed_count: 0,
        p_job_source: 'cron'
      });
      
      throw queryError;
    }

    console.log(`[${requestId}] Found ${stuckAgents?.length || 0} stuck agents`);

    if (!stuckAgents || stuckAgents.length === 0) {
      // Log success with observability - no stuck agents
      await supabaseClient.rpc('log_scheduled_job_run', {
        p_job_key: 'detect-stuck-installations',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { message: 'No stuck agents detected' },
        p_processed_count: 0,
        p_job_source: 'cron'
      });

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

      // Create system alert - use correct columns from v_agent_lifecycle_state
      const { data: alert, error: alertError } = await supabaseClient
        .from("system_alerts")
        .insert({
          tenant_id: tenantId,
          alert_type: "stuck_installations",
          severity: "high",
          title: `${agentList.length} instalacao(oes) travada(s)`,
          message: `${agentList.length} agente(s) em estado travado detectados`,
          details: {
            stuck_agents: agentList.map(a => ({
              agent_name: a.agent_name,
              agent_state: a.agent_state,
              lifecycle_status: a.lifecycle_status,
              last_heartbeat: a.last_heartbeat
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
        <h2>[WARN] Agentes em Estado Travado Detectados - ${tenant.name}</h2>
        <p><strong>${agentList.length}</strong> agente(s) em estado travado:</p>
        <ul>
          ${agentList.map(a => `
            <li>
              <strong>${a.agent_name}</strong><br/>
              Estado: ${a.agent_state || 'unknown'}<br/>
              Status: ${a.lifecycle_status || 'unknown'}<br/>
              Último heartbeat: ${a.last_heartbeat ? new Date(a.last_heartbeat).toLocaleString('pt-BR') : 'nunca'}
            </li>
          `).join('')}
        </ul>
        <p>Possiveis causas:</p>
        <ul>
          <li>Agente offline</li>
          <li>Problemas de conectividade</li>
          <li>Erro de autenticacao</li>
          <li>Firewall bloqueando conexao</li>
        </ul>
        <p>Acesse o dashboard para mais detalhes.</p>
        <hr/>
        <small>Request ID: ${requestId} | Tenant: ${tenant.name}</small>
      `;

      try {
        const emailResult = await resend.emails.send({
          from: "CyberShield Alerts <alerts@cybershield.com>",
          to: adminEmails,
          subject: `[WARN] ${agentList.length} Agente(s) em Estado Travado - ${tenant.name}`,
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

    // Log success with observability
    await supabaseClient.rpc('log_scheduled_job_run', {
      p_job_key: 'detect-stuck-installations',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: {
        stuck_count: stuckAgents.length,
        tenants_affected: Object.keys(stuckByTenant).length,
        alerts_created: alertsCreated.length,
        emails_sent: emailsSent.length
      },
      p_processed_count: stuckAgents.length,
      p_job_source: 'cron'
    });

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
    
    // Try to log failure
    try {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      
      await supabaseClient.rpc('log_scheduled_job_run', {
        p_job_key: 'detect-stuck-installations',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch {
      console.error(`[${requestId}] Failed to log error`);
    }

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
