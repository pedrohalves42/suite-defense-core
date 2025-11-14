import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Get installation pipeline metrics request started`);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Authentication failed");
    }

    // Get user's tenant_id
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (roleError || !userRole) {
      throw new Error("Could not determine user tenant");
    }

    const tenantId = userRole.tenant_id;

    // Parse query parameters
    const url = new URL(req.url);
    const hoursBack = parseInt(url.searchParams.get("hours_back") || "24");

    console.log(`[${requestId}] Fetching metrics for tenant ${tenantId}, hours_back: ${hoursBack}`);

    // Call the SQL function to calculate metrics
    const { data: metrics, error: metricsError } = await supabaseClient
      .rpc("calculate_pipeline_metrics", {
        p_tenant_id: tenantId,
        p_hours_back: hoursBack
      });

    if (metricsError) {
      console.error(`[${requestId}] Error calling calculate_pipeline_metrics:`, metricsError);
      throw metricsError;
    }

    console.log(`[${requestId}] Metrics calculated successfully:`, metrics);

    // Return the first row (the function returns a table with 1 row)
    const result = metrics && metrics.length > 0 ? metrics[0] : {
      total_generated: 0,
      total_downloaded: 0,
      total_command_copied: 0,
      total_installed: 0,
      total_active: 0,
      total_stuck: 0,
      success_rate_pct: 0,
      avg_install_time_seconds: 0,
      conversion_rate_generated_to_installed_pct: 0,
      conversion_rate_copied_to_installed_pct: 0
    };

    return new Response(
      JSON.stringify({
        success: true,
        metrics: result,
        request_id: requestId,
        tenant_id: tenantId,
        hours_back: hoursBack
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
        error: error.message,
        request_id: requestId
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
