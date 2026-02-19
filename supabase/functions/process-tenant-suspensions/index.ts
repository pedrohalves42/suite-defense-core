import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Phase 1: Process suspensions via RPC
    const { data: suspensionResult, error: suspensionError } = await supabase.rpc(
      "process_tenant_suspensions"
    );

    if (suspensionError) {
      console.error("Suspension processing error:", suspensionError);
      return new Response(
        JSON.stringify({ error: suspensionError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Phase 2: Cleanup data for suspended tenants
    const { data: suspendedTenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, suspended_at")
      .in("suspension_status", ["suspended", "pending_deletion"])
      .limit(10);

    if (tenantsError) {
      console.error("Error fetching suspended tenants:", tenantsError);
    }

    const cleanupResults = [];
    if (suspendedTenants && suspendedTenants.length > 0) {
      for (const tenant of suspendedTenants) {
        const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
          "cleanup_suspended_tenant_data",
          { p_tenant_id: tenant.id }
        );

        if (cleanupError) {
          console.error(`Cleanup error for tenant ${tenant.id}:`, cleanupError);
          cleanupResults.push({
            tenant_id: tenant.id,
            status: "error",
            error: cleanupError.message,
          });
        } else {
          cleanupResults.push({
            tenant_id: tenant.id,
            status: "completed",
            result: cleanupResult,
          });
        }
      }
    }

    const result = {
      suspension: suspensionResult,
      cleanup: {
        tenants_processed: cleanupResults.length,
        results: cleanupResults,
      },
      processed_at: new Date().toISOString(),
    };

    console.log("Tenant suspension processing completed:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
