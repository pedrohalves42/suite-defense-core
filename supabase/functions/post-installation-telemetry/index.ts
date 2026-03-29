import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { verifyHmacSignature } from "../_shared/hmac.ts";
import { hashToken } from "../_shared/token-hash.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

// HARDENED: Restrict CORS ? this endpoint is called by PowerShell agents, not browsers
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || "https://cybershield-audit.lovable.app";
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce",
};

const AgentTokenSchema = z.string().regex(/^[A-Za-z0-9]{64}$/, "Invalid agent token format");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] POST installation telemetry request started`);

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
      logger.info(`[${requestId}] Body parsed successfully`);
    } catch (parseError) {
      logger.error(`[${requestId}] Body parse failed:`, parseError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON body", 
          request_id: requestId 
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // HARDENED: X-Agent-Token is REQUIRED ? no fallback mode
    const agentTokenHeader = req.headers.get("X-Agent-Token");
    if (!agentTokenHeader) {
      logger.warn(`[${requestId}] REJECTED: Missing X-Agent-Token header`);
      return new Response(
        JSON.stringify({ 
          error: "Authentication required", 
          error_code: "MISSING_TOKEN",
          request_id: requestId 
        }),
        { status: 401, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // Validate token format
    const tokenValidation = AgentTokenSchema.safeParse(agentTokenHeader);
    if (!tokenValidation.success) {
      logger.warn(`[${requestId}] REJECTED: Invalid token format`);
      return new Response(
        JSON.stringify({ 
          error: "Invalid token format",
          error_code: "INVALID_TOKEN_FORMAT",
          request_id: requestId 
        }),
        { status: 401, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // Fetch agent token details using hash
    const tokenHash = await hashToken(agentTokenHeader);
    const { data: agentToken, error: tokenError } = await supabaseClient
      .from("agent_tokens")
      .select("agent_id, is_active, expires_at, agents!inner(id, agent_name, tenant_id, hmac_secret)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError || !agentToken) {
      logger.warn(`[${requestId}] REJECTED: Token not found, prefix: ${agentTokenHeader.substring(0, 8)}`);
      return new Response(
        JSON.stringify({ 
          error: "Invalid or unknown token",
          error_code: "TOKEN_NOT_FOUND",
          request_id: requestId 
        }),
        { status: 401, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    if (!agentToken.is_active) {
      logger.warn(`[${requestId}] REJECTED: Token inactive`);
      return new Response(
        JSON.stringify({ 
          error: "Token is inactive",
          error_code: "TOKEN_INACTIVE",
          request_id: requestId 
        }),
        { status: 403, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    if (agentToken.expires_at && new Date(agentToken.expires_at) < new Date()) {
      logger.warn(`[${requestId}] REJECTED: Token expired at ${agentToken.expires_at}`);
      return new Response(
        JSON.stringify({ 
          error: "Token has expired",
          error_code: "TOKEN_EXPIRED",
          request_id: requestId 
        }),
        { status: 403, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    const agent = agentToken.agents as Record<string, unknown>;
    
    // Verify HMAC signature ? REQUIRED for data integrity
    const hmacResult = await verifyHmacSignature(
      supabaseClient,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    const isVerified = hmacResult.valid;
    
    if (!isVerified) {
      logger.warn(`[${requestId}] REJECTED: HMAC verification failed:`, {
        errorCode: hmacResult.errorCode,
        errorMessage: hmacResult.errorMessage,
        agentName: agent.agent_name
      });
      // HARDENED: Reject unverified telemetry instead of persisting it
      return new Response(
        JSON.stringify({ 
          error: "HMAC signature verification failed",
          error_code: "HMAC_INVALID",
          request_id: requestId 
        }),
        { status: 401, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }
    
    logger.info(`[${requestId}] HMAC verified successfully for agent: ${agent.agent_name}`);

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
    
    logger.info(`[${requestId}] Telemetry data received:`, { 
      agent_name: agent.agent_name, 
      success, 
      task_created, 
      task_running,
      verified: true
    });

    // Build telemetry record ? always verified at this point
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
        verified: true,
        request_id: requestId
      },
      timestamp: installation_time || new Date().toISOString(),
    };

    // Insert telemetry (with idempotency check)
    const { error: insertError } = await supabaseClient
      .from("installation_analytics")
      .insert(telemetryData);

    if (!insertError) {
      logger.info(`[${requestId}] [OK]  Telemetry inserted successfully`, {
        agent_id: agent.id,
        agent_name: agent.agent_name,
        event_type: 'post_installation',
        tenant_id: agent.tenant_id,
        verified: true
      });
    }

    if (insertError) {
      // Handle duplicate key violations gracefully (idempotent operation)
      if (insertError.code === "23505") {
        logger.info(`[${requestId}] Duplicate telemetry detected (idempotent), returning success`);
        return new Response(
          JSON.stringify({ 
            status: "already_recorded", 
            verified: true,
            request_id: requestId,
            message: "Telemetry already recorded (idempotent)"
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
        );
      }
      
      logger.error(`[${requestId}] Database insert error:`, insertError);
      throw insertError;
    }

    logger.info(`[${requestId}] Telemetry recorded successfully`, {
      agent_id: agent.id,
      agent_name: agent.agent_name,
      verified: true,
      success: success
    });

    // Track expected first_heartbeat after installation
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
      logger.info(`[${requestId}] Installation failed, checking for admin notification`, {
        errors,
      });

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
        const profiles = adminRole.profiles as Record<string, unknown>;
        logger.info(`[${requestId}] Admin found for notification`, {
          adminEmail: profiles?.email,
        });
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        verified: true,
        request_id: requestId,
        message: "Telemetry recorded successfully",
        agent_id: agent.id,
      }),
      {
        headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: Record<string, unknown>) {
    logger.error(`[${requestId}] Unhandled error:`, { 
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
        headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
