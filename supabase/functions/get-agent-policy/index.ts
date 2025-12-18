import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hashToken } from "../_shared/token-hash.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PolicyContract {
  version: string;
  expected: {
    dns_enabled: boolean;
    dns_service_running: boolean;
    dns_filter_available: boolean;
    agent_min_version: string;
    blocked_domains_synced: boolean;
    heartbeat_interval_max: number;
    job_execution_enabled: boolean;
  };
  tenant_config?: {
    dns_upstream?: string[];
    blocked_categories?: string[];
    custom_rules?: Record<string, unknown>[];
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Validate agent token
    const agentToken = req.headers.get("X-Agent-Token");
    if (!agentToken) {
      console.log("[get-agent-policy] Missing agent token");
      return new Response(
        JSON.stringify({ error: "Missing agent token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Lookup agent by token hash
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from("agent_tokens")
      .select("agent_id, is_active")
      .eq("token_hash", tokenHash)
      .eq("is_active", true)
      .single();

    if (tokenError || !tokenData) {
      console.log("[get-agent-policy] Invalid token");
      return new Response(
        JSON.stringify({ error: "Invalid or inactive token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get agent and tenant info
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, agent_name, tenant_id")
      .eq("id", tokenData.agent_id)
      .single();

    if (agentError || !agent) {
      console.log("[get-agent-policy] Agent not found");
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant settings (if exists)
    const { data: tenantSettings } = await supabase
      .from("tenant_settings")
      .select("*")
      .eq("tenant_id", agent.tenant_id)
      .single();

    // Get latest agent version for minimum version requirement
    const { data: latestVersion } = await supabase
      .from("agent_releases")
      .select("version")
      .eq("platform", "windows")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Build policy contract
    // NOTE: dns_filter_available = false until Go binary is compiled and uploaded
    const policy: PolicyContract = {
      version: "2025-01-v1",
      expected: {
        dns_enabled: tenantSettings?.dns_enabled ?? true,
        dns_service_running: tenantSettings?.dns_enabled ?? true,
        dns_filter_available: false, // Feature flag OFF until binary exists in storage
        agent_min_version: latestVersion?.version ?? "v4.0.0",
        blocked_domains_synced: true,
        heartbeat_interval_max: tenantSettings?.heartbeat_interval ?? 120,
        job_execution_enabled: true,
      },
      tenant_config: {
        dns_upstream: tenantSettings?.dns_upstream ?? ["8.8.8.8:53", "1.1.1.1:53"],
        blocked_categories: tenantSettings?.blocked_categories ?? [],
        custom_rules: [],
      },
    };

    // Get blocked domains count for reference
    const { count: blockedCount } = await supabase
      .from("blocked_websites")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", agent.tenant_id)
      .eq("is_active", true);

    console.log(`[get-agent-policy] Policy sent to ${agent.agent_name} (blocked domains: ${blockedCount ?? 0})`);

    return new Response(
      JSON.stringify({
        ...policy,
        blocked_domains_count: blockedCount ?? 0,
        agent_name: agent.agent_name,
        tenant_id: agent.tenant_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-agent-policy] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
