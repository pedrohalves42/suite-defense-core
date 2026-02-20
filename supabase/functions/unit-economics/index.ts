import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
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

    console.log(`[UNIT-ECONOMICS] Calculating metrics for super admin ${userData.user.id}`);

    // Get all active subscriptions with pricing
    const { data: subscriptions, error: subsError } = await supabase
      .from('tenant_subscriptions')
      .select(`
        *,
        subscription_plans!inner (
          name,
          price_per_device,
          max_devices
        )
      `)
      .in('status', ['active', 'trialing']);

    if (subsError) throw subsError;

    // Calculate MRR
    let totalMrr = 0;
    let activeCount = 0;

    subscriptions?.forEach((sub: any) => {
      if (sub.status === 'active') {
        const pricePerDeviceCents = sub.subscription_plans?.price_per_device || 0;
        const quantity = sub.device_quantity || 1;
        totalMrr += (pricePerDeviceCents / 100) * quantity; // centavos -> reais
        activeCount++;
      }
    });

    // Get marketing costs
    const { data: marketingCosts, error: marketingError } = await supabase
      .from('marketing_costs')
      .select('*');

    if (marketingError) {
      console.log('[UNIT-ECONOMICS] No marketing costs data:', marketingError.message);
    }

    // Calculate CAC (Customer Acquisition Cost)
    const totalSpend = marketingCosts?.reduce((sum: number, cost: any) => sum + Number(cost.spend_cents || 0) / 100, 0) || 0;
    const totalConversions = marketingCosts?.reduce((sum: number, cost: any) => sum + (cost.conversions || 0), 0) || 0;
    const cac = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // Calculate ARPA (Average Revenue Per Account)
    const arpa = activeCount > 0 ? totalMrr / activeCount : 0;

    // Calculate churn rate from canceled subscriptions
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: canceledSubs } = await supabase
      .from('tenant_subscriptions')
      .select('id')
      .eq('status', 'canceled')
      .gte('updated_at', threeMonthsAgo.toISOString());

    const canceledCount = canceledSubs?.length || 0;
    const totalCustomers = activeCount + canceledCount;
    const monthlyChurnRate = totalCustomers > 0 ? (canceledCount / 3) / totalCustomers : 0.05; // Default 5% if no data

    // Calculate LTV (Customer Lifetime Value)
    // LTV = (ARPA ? Gross Margin) / Churn Rate
    const grossMargin = 0.85; // 85% margin for SaaS
    const ltv = monthlyChurnRate > 0 ? (arpa * grossMargin) / monthlyChurnRate : arpa * 12;

    // Calculate Payback Period (in months)
    // Payback = CAC / (ARPA ? Gross Margin)
    const monthlyGrossProfit = arpa * grossMargin;
    const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : 0;

    // Calculate LTV/CAC ratio
    const ltvCacRatio = cac > 0 ? ltv / cac : 0;

    // Calculate ARR
    const arr = totalMrr * 12;

    const response = {
      mrr: Math.round(totalMrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      arpa: Math.round(arpa * 100) / 100,
      cac: Math.round(cac * 100) / 100,
      ltv: Math.round(ltv * 100) / 100,
      ltv_cac_ratio: Math.round(ltvCacRatio * 100) / 100,
      payback_months: Math.round(paybackMonths * 10) / 10,
      churn_rate: Math.round(monthlyChurnRate * 1000) / 10, // Percentage
      gross_margin: grossMargin * 100,
      active_customers: activeCount,
      total_marketing_spend: Math.round(totalSpend * 100) / 100,
      total_conversions: totalConversions,
    };

    console.log(`[UNIT-ECONOMICS] Success: MRR=${response.mrr}, LTV=${response.ltv}, CAC=${response.cac}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[UNIT-ECONOMICS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500,
      }
    );
  }
});
