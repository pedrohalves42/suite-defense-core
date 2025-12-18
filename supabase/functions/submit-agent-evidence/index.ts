import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EvidenceEntry {
  event_type: string;
  event_data: Record<string, unknown>;
  evidence_hash: string;
  state_before?: string;
  state_after?: string;
  severity?: string;
}

interface RequestBody {
  agent_name: string;
  agent_version: string;
  entries: EvidenceEntry[];
}

serve(async (req) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get agent token from headers
    const agentToken = req.headers.get("x-agent-token");
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: "Missing agent token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate agent token
    const { data: tokenData, error: tokenError } = await supabase
      .from("agent_tokens")
      .select("agent_id, agents!inner(id, tenant_id, agent_name)")
      .eq("token", agentToken)
      .eq("is_active", true)
      .single();

    if (tokenError || !tokenData) {
      console.error("[submit-agent-evidence] Invalid token:", tokenError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Extract agent info safely
    const agentsData = tokenData.agents as unknown as { id: string; tenant_id: string; agent_name: string } | null;
    if (!agentsData) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agentInfo = agentsData;
    const body: RequestBody = await req.json();

    if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty entries array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate entries (max 100 per request)
    const entries = body.entries.slice(0, 100);
    const validEventTypes = [
      'state_change', 'job_execution', 'dns_block', 'policy_sync',
      'auto_recovery', 'heartbeat', 'update_applied', 'error',
      'policy_drift', 'security_event'
    ];
    const validSeverities = ['debug', 'info', 'warning', 'error', 'critical'];

    // Prepare records for insertion
    const records = entries.map(entry => ({
      tenant_id: agentInfo.tenant_id,
      agent_id: agentInfo.id,
      agent_name: body.agent_name || agentInfo.agent_name,
      agent_version: body.agent_version || null,
      event_type: validEventTypes.includes(entry.event_type) ? entry.event_type : 'security_event',
      event_data: entry.event_data || {},
      evidence_hash: entry.evidence_hash || 'hash_not_provided',
      state_before: entry.state_before || null,
      state_after: entry.state_after || null,
      severity: validSeverities.includes(entry.severity || '') ? entry.severity : 'info'
    }));

    // Insert evidence records
    const { data: insertedData, error: insertError } = await supabase
      .from("agent_evidence_logs")
      .insert(records)
      .select("id");

    if (insertError) {
      console.error("[submit-agent-evidence] Insert error:", insertError.message);
      return new Response(
        JSON.stringify({ error: "Failed to store evidence", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[submit-agent-evidence] Stored ${records.length} evidence entries for agent ${agentInfo.agent_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        stored_count: insertedData?.length || records.length,
        agent_name: agentInfo.agent_name
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[submit-agent-evidence] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
