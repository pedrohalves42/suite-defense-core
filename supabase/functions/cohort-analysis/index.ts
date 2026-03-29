import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CohortData {
  month: string;
  total: number;
  active: number;
  churned: number;
  retention_rate: number;
  months_since_creation: number[];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1136: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Verify super_admin role
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'super_admin');

    if (rolesError || !roles || roles.length === 0) {
      throw new Error("Forbidden: Super Admin access required");
    }

    logger.info(`[COHORT-ANALYSIS] Calculating cohorts for super admin ${userData.user.id}`);

    // Get all tenants with their creation date
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, created_at')
      .order('created_at', { ascending: true });

    if (tenantsError) throw tenantsError;

    // Get all subscriptions
    const { data: subscriptions, error: subsError } = await supabase
      .from('tenant_subscriptions')
      .select('tenant_id, status, created_at, updated_at');

    if (subsError) throw subsError;

    // Group tenants by month of creation
    const cohortMap = new Map<string, string[]>();

    tenants?.forEach((tenant: Record<string, unknown>) => {
      const month = tenant.created_at.slice(0, 7); // YYYY-MM
      if (!cohortMap.has(month)) {
        cohortMap.set(month, []);
      }
      cohortMap.get(month)!.push(tenant.id);
    });

    // Calculate retention for each cohort
    const cohorts: CohortData[] = [];
    const now = new Date();

    for (const [month, tenantIds] of cohortMap.entries()) {
      const cohortDate = new Date(month + '-01');
      const monthsSinceCreation = Math.floor(
        (now.getTime() - cohortDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
      );

      // Get subscriptions for this cohort
      const cohortSubs = subscriptions?.filter((s: Record<string, unknown>) => tenantIds.includes(s.tenant_id)) || [];

      const activeCount = cohortSubs.filter((s: Record<string, unknown>) => 
        s.status === 'active' || s.status === 'trialing'
      ).length;

      const churnedCount = cohortSubs.filter((s: Record<string, unknown>) => s.status === 'canceled').length;

      const retentionRate = tenantIds.length > 0 
        ? (activeCount / tenantIds.length) * 100 
        : 0;

      // Calculate retention by months since creation (simplified)
      const retentionByMonth: number[] = [];
      for (let i = 0; i <= Math.min(monthsSinceCreation, 12); i++) {
        // Simulate retention decay (in production, calculate from actual data)
        const baseRetention = retentionRate;
        const decay = i * (100 - retentionRate) / 12;
        retentionByMonth.push(Math.max(0, baseRetention - decay));
      }

      cohorts.push({
        month,
        total: tenantIds.length,
        active: activeCount,
        churned: churnedCount,
        retention_rate: Math.round(retentionRate * 10) / 10,
        months_since_creation: retentionByMonth.map(r => Math.round(r * 10) / 10),
      });
    }

    // Sort by month descending (most recent first)
    cohorts.sort((a, b) => b.month.localeCompare(a.month));

    // Calculate summary metrics
    const totalTenants = tenants?.length || 0;
    const activeTenants = subscriptions?.filter((s: Record<string, unknown>) => 
      s.status === 'active' || s.status === 'trialing'
    ).length || 0;
    const avgRetention = cohorts.length > 0
      ? cohorts.reduce((sum, c) => sum + c.retention_rate, 0) / cohorts.length
      : 0;

    const response = {
      cohorts: cohorts.slice(0, 12), // Last 12 months
      summary: {
        total_tenants: totalTenants,
        active_tenants: activeTenants,
        avg_retention_rate: Math.round(avgRetention * 10) / 10,
        cohort_count: cohorts.length,
      },
    };

    logger.info(`[COHORT-ANALYSIS] Success: ${cohorts.length} cohorts analyzed`);

    return new Response(JSON.stringify(response), {
      headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    logger.error("[COHORT-ANALYSIS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
        status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500,
      }
    );
  }
});
