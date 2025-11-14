import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { verifyHmacSignature } from "../_shared/hmac.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce",
};

const AgentTokenSchema = z.string().regex(/^[A-Za-z0-9]{64}$/, "Invalid agent token format");

// Helper function to record unverified telemetry (best-effort fallback)
async function recordUnverifiedTelemetry(
  supabaseClient: any,
  body: any,
  requestId: string
): Promise<void> {
  try {
    console.log(`[${requestId}] Recording unverified telemetry (fallback mode)`);
    
    // Try to match tenant by partial token if provided
    let tenantId = null;
    const partialToken = body.agent_token;
    
    if (partialToken && typeof partialToken === 'string' && partialToken.length >= 8) {
      const { data: tokenMatch } = await supabaseClient
        .from("agent_tokens")
        .select("agents!inner(tenant_id)")
        .like("token", `${partialToken}%`)
        .limit(1)
        .maybeSingle();
      
      if (tokenMatch?.agents) {
        tenantId = (tokenMatch.agents as any).tenant_id;
        console.log(`[${requestId}] Matched tenant from partial token: ${tenantId}`);
      }
    }
    
    // Build unverified telemetry record
    const telemetryRecord = {
      tenant_id: tenantId,
      agent_id: null,
      agent_name: "unknown",
      event_type: "post_installation_unverified",
      platform: "windows",
      success: body.success ?? null,
      network_connectivity: body.network_tests?.health_check_passed ?? null,
      installation_time_seconds: body.installation_time_seconds || null,
      error_message: null,
      metadata: {
        ...body,
        verified: false,
        unverified_reason: "authentication_failed",
        request_id: requestId,
        recorded_at: new Date().toISOString()
      }
    };
    
    // Insert with error handling for duplicates
    const { error: insertError } = await supabaseClient
      .from("installation_analytics")
      .insert(telemetryRecord);
    
    if (insertError) {
      // Ignore duplicate key violations (23505) - idempotent
      if (insertError.code === "23505") {
        console.log(`[${requestId}] Duplicate unverified telemetry detected (idempotent), ignoring`);
        return;
      }
      throw insertError;
    }
    
    console.log(`[${requestId}] Unverified telemetry recorded successfully`);
  } catch (error) {
    console.error(`[${requestId}] Failed to record unverified telemetry:`, error);
    // Don't throw - this is best-effort fallback
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] POST installation telemetry request started`);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Parse body FIRST (before validating auth)
    let body: any;
    try {
      body = await req.json();
      console.log(`[${requestId}] Body parsed successfully`);
    } catch (parseError) {
      console.error(`[${requestId}] Body parse failed:`, parseError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON body", 
          request_id: requestId 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract X-Agent-Token (required for verified mode)
    const agentTokenHeader = req.headers.get("X-Agent-Token");
    if (!agentTokenHeader) {
      console.warn(`[${requestId}] Missing X-Agent-Token header, using fallback mode`);
      
      // FALLBACK MODE: Record telemetry as unverified
      await recordUnverifiedTelemetry(supabaseClient, body, requestId);
      
      return new Response(
        JSON.stringify({ 
          status: "recorded_unverified", 
          request_id: requestId,
          message: "Telemetry recorded without authentication" 
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token format
    const tokenValidation = AgentTokenSchema.safeParse(agentTokenHeader);
    if (!tokenValidation.success) {
      console.warn(`[${requestId}] Invalid token format, using fallback mode`, tokenValidation.error);
      await recordUnverifiedTelemetry(supabaseClient, body, requestId);
      return new Response(
        JSON.stringify({ 
          status: "recorded_unverified", 
          request_id: requestId,
          message: "Invalid token format - telemetry recorded as unverified"
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent token details
    const { data: agentToken, error: tokenError } = await supabaseClient
      .from("agent_tokens")
      .select("agent_id, is_active, expires_at, agents!inner(id, agent_name, tenant_id, hmac_secret)")
      .eq("token", agentTokenHeader)
      .maybeSingle();

    if (tokenError || !agentToken) {
      console.warn(`[${requestId}] Agent token not found, using fallback mode`, tokenError);
      await recordUnverifiedTelemetry(supabaseClient, body, requestId);
      return new Response(
        JSON.stringify({ 
          status: "recorded_unverified", 
          request_id: requestId,
          message: "Token not found - telemetry recorded as unverified"
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!agentToken.is_active) {
      console.warn(`[${requestId}] Agent token is inactive, using fallback mode`);
      await recordUnverifiedTelemetry(supabaseClient, body, requestId);
      return new Response(
        JSON.stringify({ 
          status: "recorded_unverified", 
          request_id: requestId,
          message: "Token inactive - telemetry recorded as unverified"
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agentToken.expires_at && new Date(agentToken.expires_at) < new Date()) {
      console.warn(`[${requestId}] Agent token expired, using fallback mode`);
      await recordUnverifiedTelemetry(supabaseClient, body, requestId);
      return new Response(
        JSON.stringify({ 
          status: "recorded_unverified", 
          request_id: requestId,
          message: "Token expired - telemetry recorded as unverified"
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agent = agentToken.agents as any;
    
    // Verify HMAC signature (preferred, but not blocking)
    const hmacResult = await verifyHmacSignature(
      supabaseClient,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    const isVerified = hmacResult.valid;
    
    if (!isVerified) {
      console.warn(`[${requestId}] HMAC verification failed: ${hmacResult.error}`);
      console.warn(`[${requestId}] Recording telemetry as unverified but linked to agent`);
    } else {
      console.log(`[${requestId}] HMAC verified successfully for agent: ${agent.agent_name}`);
    }

    // Parse telemetry data from body
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
      powershell_version,
      metadata
    } = body;
    
    console.log(`[${requestId}] Telemetry data received:`, { 
      agent_name: agent.agent_name, 
      success, 
      task_created, 
      task_running,
      verified: isVerified
    });

    // Build telemetry record with comprehensive data
    const telemetryData = {
      agent_id: agent.id,
      tenant_id: agent.tenant_id,
      agent_name: agent.agent_name,
      event_type: "post_installation",
      platform: "windows",
      success: success ?? true,
      error_message: errors ? JSON.stringify(errors) : null,
      network_connectivity: network_tests?.health_check_passed ?? null,
      dns_resolution: network_tests?.dns_test ?? null,
      api_connectivity: network_tests?.api_test ?? null,
      os_info: {
        type: agent.os_type,
        version: os_version || agent.os_version,
        hostname: agent.hostname,
        powershell_version: powershell_version || null
      },
      installation_method: "windows_ps1",
      firewall_status: firewall_status || "unknown",
      proxy_detected: proxy_detected || false,
      metadata: {
        task_created: task_created,
        task_running: task_running,
        script_exists: script_exists,
        script_size_bytes: script_size_bytes,
        verified: isVerified,
        hmac_error: isVerified ? null : hmacResult.error,
        request_id: requestId
      },
      timestamp: installation_time || new Date().toISOString(),
    };

    // Insert telemetry (with idempotency check)
    const { error: insertError } = await supabaseClient
      .from("installation_analytics")
      .insert(telemetryData);

    if (!insertError) {
      console.log(`[${requestId}] ✅ Telemetry inserted successfully`, {
        agent_id: agent.id,
        agent_name: body.agent_name,
        event_type: 'post_installation',
        tenant_id: agent.tenant_id,
        verified: isVerified
      });
    }

    if (insertError) {
      // Handle duplicate key violations gracefully (idempotent operation)
      if (insertError.code === "23505") {
        console.log(`[${requestId}] Duplicate telemetry detected (idempotent), returning success`);
        return new Response(
          JSON.stringify({ 
            status: "already_recorded", 
            verified: isVerified,
            request_id: requestId,
            message: "Telemetry already recorded (idempotent)"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error(`[${requestId}] Database insert error:`, insertError);
      throw insertError;
    }

    console.log(`[${requestId}] Telemetry recorded successfully`, {
      agent_id: agent.id,
      agent_name: agent.agent_name,
      verified: isVerified,
      success: success
    });

    // FASE 1: Rastrear first_heartbeat esperado após instalação
    if (success && metadata?.installation_complete) {
      await supabaseClient
        .from('installation_analytics')
        .insert({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          agent_name: agent.agent_name,
          event_type: 'awaiting_first_heartbeat',
          platform: 'windows',
          success: true,
          metadata: {
            installation_timestamp: new Date().toISOString(),
            expected_heartbeat_within_seconds: 120
          }
        });
    }

    // Handle failed installations by notifying admins (optional)
    if (!success) {
      console.log(`[${requestId}] Installation failed, checking for admin notification`, {
        errors,
      });

      // Fetch admin of the tenant for notification (non-blocking)
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
        console.log(`[${requestId}] Admin found for notification`, {
          adminEmail: profiles?.email,
        });
        // TODO: Trigger email notification or in-app alert
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        verified: isVerified,
        request_id: requestId,
        message: "Telemetry recorded successfully",
        agent_id: agent.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error(`[${requestId}] Unhandled error:`, { 
      message: error.message, 
      stack: error.stack 
    });
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        request_id: requestId,
        message: error.message 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
