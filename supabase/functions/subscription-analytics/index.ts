import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MonthlyData {
  month: string;
  mrr: number;
  new: number;
  churned: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Verificar se é admin
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', userData.user.id)
      .in('role', ['admin', 'super_admin']);

    if (rolesError || !roles || roles.length === 0) {
      throw new Error("Forbidden: Admin access required");
    }

    const isSuperAdmin = roles.some(r => r.role === 'super_admin');
    const tenantId = isSuperAdmin ? null : roles[0].tenant_id;

    console.log(`[SUBSCRIPTION-ANALYTICS] User ${userData.user.id} (super_admin: ${isSuperAdmin})`);

    // Query base para subscriptions
    let subsQuery = supabase
      .from('tenant_subscriptions')
      .select(`
        *,
        subscription_plans!inner (
          name,
          price_per_device,
          max_devices
        ),
        tenants!inner (
          name,
          created_at
        )
      `);

    // Filtrar por tenant se não for super admin
    if (!isSuperAdmin && tenantId) {
      subsQuery = subsQuery.eq('tenant_id', tenantId);
    }

    const { data: subscriptions, error: subsError } = await subsQuery;
    if (subsError) throw subsError;

    // Calcular MRR (Monthly Recurring Revenue)
    let totalMrr = 0;
    let activeCount = 0;
    let trialingCount = 0;
    let canceledCount = 0;
    let pastDueCount = 0;

    subscriptions?.forEach((sub: any) => {
      const status = sub.status;
      const pricePerDevice = sub.subscription_plans.price_per_device || 0;
      const quantity = sub.device_quantity || 1;

      // Contar status
      if (status === 'active') {
        activeCount++;
        totalMrr += (pricePerDevice * quantity);
      } else if (status === 'trialing') {
        trialingCount++;
      } else if (status === 'canceled') {
        canceledCount++;
      } else if (status === 'past_due') {
        pastDueCount++;
      }
    });

    // Calcular métricas dos últimos 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Buscar audit logs para calcular churn e conversões
    let auditQuery = supabase
      .from('audit_logs')
      .select('action, resource_type, created_at, details')
      .eq('resource_type', 'subscription')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

    if (!isSuperAdmin && tenantId) {
      auditQuery = auditQuery.eq('tenant_id', tenantId);
    }

    const { data: auditLogs } = await auditQuery;

    // Processar dados mensais
    const monthlyDataMap = new Map<string, MonthlyData>();
    
    // Inicializar últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
      monthlyDataMap.set(monthKey, {
        month: monthKey,
        mrr: 0,
        new: 0,
        churned: 0,
      });
    }

    // Contar novos e cancelados por mês
    let totalTrials = 0;
    let convertedTrials = 0;

    subscriptions?.forEach((sub: any) => {
      const createdDate = new Date(sub.created_at);
      const monthKey = createdDate.toISOString().substring(0, 7);
      
      if (monthlyDataMap.has(monthKey)) {
        const monthData = monthlyDataMap.get(monthKey)!;
        monthData.new++;
        
        // Calcular MRR histórico (simplificado)
        if (sub.status === 'active' || sub.status === 'trialing') {
          const pricePerDevice = sub.subscription_plans.price_per_device || 0;
          const quantity = sub.device_quantity || 1;
          monthData.mrr += (pricePerDevice * quantity);
        }
      }

      // Contar trials
      if (sub.trial_end) {
        totalTrials++;
        if (sub.status === 'active') {
          convertedTrials++;
        }
      }
    });

    // Processar cancelamentos dos audit logs
    auditLogs?.forEach((log: any) => {
      if (log.action === 'cancel_subscription') {
        const monthKey = new Date(log.created_at).toISOString().substring(0, 7);
        if (monthlyDataMap.has(monthKey)) {
          monthlyDataMap.get(monthKey)!.churned++;
        }
      }
    });

    // Converter Map para Array ordenado
    const revenueTrend = Array.from(monthlyDataMap.values())
      .sort((a, b) => a.month.localeCompare(b.month));

    const newVsChurned = revenueTrend.map(({ month, new: newSubs, churned }) => ({
      month,
      new: newSubs,
      churned,
    }));

    // Calcular churn rate (média dos últimos 3 meses)
    const recentChurns = newVsChurned.slice(-3);
    const totalChurned = recentChurns.reduce((sum, m) => sum + m.churned, 0);
    const totalActive = activeCount + trialingCount;
    const churnRate = totalActive > 0 ? (totalChurned / totalActive) * 100 : 0;

    // Calcular trial conversion rate
    const trialConversionRate = totalTrials > 0 ? (convertedTrials / totalTrials) * 100 : 0;

    // Calcular receita média por cliente
    const avgRevenuePerCustomer = activeCount > 0 ? totalMrr / activeCount : 0;

    const response = {
      mrr: totalMrr,
      churn_rate: Math.round(churnRate * 10) / 10,
      trial_conversion_rate: Math.round(trialConversionRate * 10) / 10,
      revenue_trend: revenueTrend,
      new_vs_churned: newVsChurned,
      subscriptions_by_status: {
        active: activeCount,
        trialing: trialingCount,
        canceled: canceledCount,
        past_due: pastDueCount,
      },
      total_subscriptions: subscriptions?.length || 0,
      avg_revenue_per_customer: Math.round(avgRevenuePerCustomer * 100) / 100,
    };

    console.log(`[SUBSCRIPTION-ANALYTICS] Success: MRR=${response.mrr}, Churn=${response.churn_rate}%`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION-ANALYTICS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500,
      }
    );
  }
});
