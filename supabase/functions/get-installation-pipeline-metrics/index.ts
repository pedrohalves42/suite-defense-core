import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] Get installation pipeline metrics request started`);

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

    // Parse parameters from body OR URL (body takes precedence)
    let hoursBack: number | null = null;
    
    // Try to get from body first
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.hours_back !== undefined && body.hours_back !== null) {
          hoursBack = parseInt(body.hours_back);
        }
      } catch {
        // Body parsing failed, use URL params
      }
    }
    
    // Fallback to URL params
    if (hoursBack === null) {
      const url = new URL(req.url);
      const hoursBackRaw = url.searchParams.get("hours_back");
      if (hoursBackRaw) {
        hoursBack = parseInt(hoursBackRaw);
      }
    }

    // Validate hours_back parameter if provided
    if (hoursBack !== null && (isNaN(hoursBack) || hoursBack < 1 || hoursBack > 720)) {
      logger.error(`[${requestId}] Invalid hours_back: ${hoursBack}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid hours_back parameter. Must be between 1 and 720 (30 days).",
          request_id: requestId
        }),
        {
          headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
          status: 400
        }
      );
    }

    logger.info(`[${requestId}] Fetching metrics for tenant ${tenantId}, hours_back: ${hoursBack ?? 'all time'}`);

    // Call the SQL function to calculate metrics (null means all time)
    const { data: metrics, error: metricsError } = await supabaseClient
      .rpc("calculate_pipeline_metrics", {
        p_tenant_id: tenantId,
        p_hours_back: hoursBack
      });

    if (metricsError) {
      logger.error(`[${requestId}] Error calling calculate_pipeline_metrics:`, metricsError);
      throw metricsError;
    }

    logger.info(`[${requestId}] Metrics calculated successfully:`, metrics);

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
        hours_back: hoursBack ?? 'all'
      }),
      {
        headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (error) {
    logger.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: requestId
      }),
      {
        headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
