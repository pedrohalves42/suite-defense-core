import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { recordMetric } from '../_shared/apm.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1108: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    logger.info("[RESET-DAILY-QUOTAS] Starting daily quota reset");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Reset advanced_scans_daily quota for all tenants
    const { error } = await supabaseClient
      .from("tenant_features")
      .update({ quota_used: 0 })
      .eq("feature_key", "advanced_scans_daily");

    if (error) throw error;

    logger.info("[RESET-DAILY-QUOTAS] Daily quotas reset successfully");

    // APM metric
    recordMetric({
      function_name: 'reset-daily-quotas',
      operation_type: 'edge_function',
      duration_ms: Date.now() - Date.now(),
      status_code: 200,
    }).catch((e) => logger.warn('[reset-daily-quotas] APM metric failed:', e));

    return new Response(
      JSON.stringify({ success: true, message: "Daily quotas reset successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[RESET-DAILY-QUOTAS] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
