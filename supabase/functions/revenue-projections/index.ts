import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Scenario {
  name: string;
  monthlyGrowthRate: number;
  churnRate: number;
  conversionRate: number;
}

interface MonthlyProjection {
  month: number;
  mrr: number;
  arr: number;
  customers: number;
  newCustomers: number;
  churnedCustomers: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    logger.info(`[REVENUE-PROJECTIONS] Calculating projections for super admin ${userData.user.id}`);

    // Get current MRR
    const { data: subscriptions, error: subsError } = await supabase
      .from('tenant_subscriptions')
      .select(`
        *,
        subscription_plans!inner (
          price_per_device
        )
      `)
      .eq('status', 'active');

    if (subsError) throw subsError;

    let currentMrr = 0;
    let currentCustomers = 0;

    subscriptions?.forEach((sub: any) => {
      const pricePerDeviceCents = sub.subscription_plans?.price_per_device || 0;
      const quantity = sub.device_quantity || 1;
      currentMrr += (pricePerDeviceCents / 100) * quantity; // centavos -> reais
      currentCustomers++;
    });

    // Get custom parameters if POST
    let customParams = {
      avgTicket: currentCustomers > 0 ? currentMrr / currentCustomers : 100,
    };

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.avgTicket) customParams.avgTicket = body.avgTicket;
      } catch {
        // Use defaults
      }
    }

    // Define scenarios
    const scenarios: Scenario[] = [
      {
        name: 'conservative',
        monthlyGrowthRate: 0.05, // 5% monthly growth
        churnRate: 0.05, // 5% monthly churn
        conversionRate: 0.15, // 15% trial conversion
      },
      {
        name: 'realistic',
        monthlyGrowthRate: 0.10, // 10% monthly growth
        churnRate: 0.03, // 3% monthly churn
        conversionRate: 0.25, // 25% trial conversion
      },
      {
        name: 'optimistic',
        monthlyGrowthRate: 0.20, // 20% monthly growth
        churnRate: 0.02, // 2% monthly churn
        conversionRate: 0.35, // 35% trial conversion
      },
    ];

    // Generate 12-month projections for each scenario
    const projections: Record<string, MonthlyProjection[]> = {};

    for (const scenario of scenarios) {
      const monthlyData: MonthlyProjection[] = [];
      let mrr = currentMrr || 320; // Base MRR if no data
      let customers = currentCustomers || 5; // Base customers if no data

      for (let month = 1; month <= 12; month++) {
        // Calculate new customers from growth
        const newCustomers = Math.round(customers * scenario.monthlyGrowthRate);
        
        // Calculate churned customers
        const churnedCustomers = Math.round(customers * scenario.churnRate);
        
        // Update totals
        customers = customers + newCustomers - churnedCustomers;
        mrr = customers * customParams.avgTicket;

        monthlyData.push({
          month,
          mrr: Math.round(mrr * 100) / 100,
          arr: Math.round(mrr * 12 * 100) / 100,
          customers,
          newCustomers,
          churnedCustomers,
        });
      }

      projections[scenario.name] = monthlyData;
    }

    // Calculate summary metrics
    const monthNames = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];

    const currentMonth = new Date().getMonth();
    const monthLabels = Array.from({ length: 12 }, (_, i) => {
      const monthIndex = (currentMonth + i + 1) % 12;
      return monthNames[monthIndex];
    });

    const response = {
      current: {
        mrr: Math.round(currentMrr * 100) / 100,
        arr: Math.round(currentMrr * 12 * 100) / 100,
        customers: currentCustomers,
        avg_ticket: Math.round(customParams.avgTicket * 100) / 100,
      },
      projections,
      month_labels: monthLabels,
      scenarios: scenarios.map(s => ({
        name: s.name,
        growth_rate: s.monthlyGrowthRate * 100,
        churn_rate: s.churnRate * 100,
        conversion_rate: s.conversionRate * 100,
        year_end_mrr: projections[s.name][11].mrr,
        year_end_arr: projections[s.name][11].arr,
        year_end_customers: projections[s.name][11].customers,
      })),
    };

    logger.info(`[REVENUE-PROJECTIONS] Success: Current MRR=${currentMrr}, Customers=${currentCustomers}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    logger.error("[REVENUE-PROJECTIONS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500,
      }
    );
  }
});
