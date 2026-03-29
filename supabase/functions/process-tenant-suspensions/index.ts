import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';


Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1122: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Phase 1: Process suspensions via RPC
    const { data: suspensionResult, error: suspensionError } = await supabase.rpc(
      "process_tenant_suspensions"
    );

    if (suspensionError) {
      logger.error("Suspension processing error:", suspensionError);
      return new Response(
        JSON.stringify({ error: suspensionError.message }),
        { status: 500, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // Phase 2: Cleanup data for suspended tenants
    const { data: suspendedTenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, suspended_at")
      .in("suspension_status", ["suspended", "pending_deletion"])
      .limit(10);

    if (tenantsError) {
      logger.error("Error fetching suspended tenants:", tenantsError);
    }

    const cleanupResults = [];
    if (suspendedTenants && suspendedTenants.length > 0) {
      for (const tenant of suspendedTenants) {
        const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
          "cleanup_suspended_tenant_data",
          { p_tenant_id: tenant.id }
        );

        if (cleanupError) {
          logger.error(`Cleanup error for tenant ${tenant.id}:`, cleanupError);
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

    logger.info("Tenant suspension processing completed:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
});
