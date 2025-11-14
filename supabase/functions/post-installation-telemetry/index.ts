import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { verifyHmacSignature } from "../_shared/hmac.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce",
};

const AgentTokenSchema = z.string().regex(/^[A-Za-z0-9]{64}$/, "Invalid agent token format");

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

    // Validate X-Agent-Token header
    const agentTokenHeader = req.headers.get("X-Agent-Token");
    if (!agentTokenHeader) {
      logStep("Missing X-Agent-Token header");
      return new Response(
        JSON.stringify({ error: "Missing X-Agent-Token header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const tokenValidation = AgentTokenSchema.safeParse(agentTokenHeader);
    if (!tokenValidation.success) {
      logStep("Invalid token format", { error: tokenValidation.error });
      return new Response(
        JSON.stringify({ error: "Invalid agent token format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Fetch agent token details
    const { data: agentToken, error: tokenError } = await supabaseClient
      .from("agent_tokens")
      .select("agent_id, is_active, expires_at, agents!inner(id, agent_name, tenant_id, hmac_secret)")
      .eq("token", agentTokenHeader)
      .maybeSingle();

    if (tokenError || !agentToken) {
      logStep("Agent token not found", { error: tokenError });
      return new Response(
        JSON.stringify({ error: "Invalid agent token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    if (!agentToken.is_active) {
      logStep("Agent token inactive");
      return new Response(
        JSON.stringify({ error: "Agent token is inactive" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    if (agentToken.expires_at && new Date(agentToken.expires_at) < new Date()) {
      logStep("Agent token expired");
      return new Response(
        JSON.stringify({ error: "Agent token expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const agent = agentToken.agents as any;
    
    // Verify HMAC signature
    const hmacResult = await verifyHmacSignature(
      supabaseClient,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    if (!hmacResult.valid) {
      logStep("HMAC verification failed", { error: hmacResult.error });
      return new Response(
        JSON.stringify({ error: hmacResult.error || "HMAC verification failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    logStep("Authentication successful", { agent_name: agent.agent_name });

    // Parse telemetry data
    const body = await req.json();
    const {
      success,
      os_version,
      installation_time,
      network_tests,
      firewall_status,
      proxy_detected,
      errors,
      task_created,
      task_running,
      script_exists,
      script_size_bytes,
      powershell_version
    } = body;
    
    logStep("Received telemetry", { agent_name: agent.agent_name, success, task_created, task_running });

    // Insert telemetry data
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
      powershell_version: powershell_version || null  // ✅ FASE 2: NOVO
    },
    installation_method: "windows_ps1",
    firewall_status: firewall_status || "unknown",
    proxy_detected: proxy_detected || false,
    metadata: {                                       // ✅ FASE 2: NOVO
      task_created: task_created,
      task_running: task_running,
      script_exists: script_exists,
      script_size_bytes: script_size_bytes
    },
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
