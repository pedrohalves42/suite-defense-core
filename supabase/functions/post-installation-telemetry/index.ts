import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[POST-INSTALL-TELEMETRY] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { agent_name, success, os_version, installation_time, network_tests, firewall_status, proxy_detected, errors } = await req.json();
    logStep("Received telemetry", { agent_name, success, network_tests });

    if (!agent_name) {
      throw new Error("agent_name is required");
    }

    // Buscar agente
    const { data: agent, error: agentError } = await supabaseClient
      .from("agents")
      .select("*")
      .eq("agent_name", agent_name)
      .maybeSingle();

    if (agentError) throw agentError;
    if (!agent) {
      logStep("Agent not found", { agent_name });
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // ✅ FASE 5.1: Registrar telemetria EXPANDIDA de instalação
    const telemetryData = {
      agent_id: agent.id,
      tenant_id: agent.tenant_id,
      event_type: "post_installation",
      success: success || false,
      error_message: errors ? JSON.stringify(errors) : null,
      network_connectivity: network_tests?.health_check_passed || null,
      dns_resolution: network_tests?.dns_test || null,
      api_connectivity: network_tests?.api_test || null,
      os_info: {
        type: agent.os_type,
        version: os_version || agent.os_version,
        hostname: agent.hostname,
      },
      installation_method: "windows_ps1",
      firewall_status: firewall_status || "unknown",
      proxy_detected: proxy_detected || false,
      timestamp: installation_time || new Date().toISOString(),
    };

    const { error: insertError } = await supabaseClient
      .from("installation_analytics")
      .insert(telemetryData);

    if (insertError) throw insertError;

    logStep("Telemetry saved", { agentId: agent.id });

    // Se houver falha, criar alerta
    if (!success) {
      logStep("Installation failed, creating alert", {
        agent_name,
        errors,
      });

      // Buscar admin do tenant para notificar
      const { data: adminRole } = await supabaseClient
        .from("user_roles")
        .select(`
          user_id,
          profiles!inner (
            email
          )
        `)
        .eq("tenant_id", agent.tenant_id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (adminRole) {
        const profiles = adminRole.profiles as any;
        // TODO: Enviar alerta por email ou notificação in-app
        logStep("Admin found for notification", {
          adminEmail: profiles?.email,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Telemetry recorded successfully",
        agentId: agent.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
