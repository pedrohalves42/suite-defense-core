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
  console.log(`[${requestId}] Alert high failure rate check started`);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Check failure rate for all tenants
    const { data: failureStats, error: statsError } = await supabaseClient
      .rpc("check_installation_failure_rate", {
        p_tenant_id: null, // Check all tenants
        p_hours_back: 1, // Last hour
        p_threshold_pct: 30.0 // 30% threshold
      });

    if (statsError) {
      console.error(`[${requestId}] Error checking failure rate:`, statsError);
      throw statsError;
    }

    console.log(`[${requestId}] Checked ${failureStats?.length || 0} tenants`);

    let alertsCreated = 0;

    // Create alerts for tenants exceeding threshold
    for (const stat of failureStats || []) {
      if (!stat.exceeds_threshold) continue;

      // Check if alert already exists for this period
      const { data: existingAlert } = await supabaseClient
        .from('system_alerts')
        .select('id')
        .eq('tenant_id', stat.tenant_id)
        .eq('alert_type', 'high_failure_rate')
        .eq('resolved', false)
        .gte('created_at', stat.period_start)
        .maybeSingle();

      if (existingAlert) {
        console.log(`[${requestId}] Alert already exists for tenant ${stat.tenant_id}`);
        continue;
      }

      // Get tenant name
      const { data: tenant } = await supabaseClient
        .from('tenants')
        .select('name')
        .eq('id', stat.tenant_id)
        .single();

      // Create alert
      const { error: alertError } = await supabaseClient
        .from('system_alerts')
        .insert({
          tenant_id: stat.tenant_id,
          alert_type: 'high_failure_rate',
          severity: stat.failure_rate_pct > 50 ? 'high' : 'medium',
          title: 'Alta Taxa de Falha nas Instalações',
          message: `Taxa de falha de ${stat.failure_rate_pct}% detectada (${stat.failed_attempts} de ${stat.total_attempts} instalações falharam na última hora). Limiar: 30%.`,
          details: {
            tenant_name: tenant?.name,
            failure_rate_pct: stat.failure_rate_pct,
            total_attempts: stat.total_attempts,
            failed_attempts: stat.failed_attempts,
            period_start: stat.period_start,
            period_end: stat.period_end,
            threshold_pct: 30.0
          }
        });

      if (alertError) {
        console.error(`[${requestId}] Error creating alert for tenant ${stat.tenant_id}:`, alertError);
        continue;
      }

      alertsCreated++;
      console.log(`[${requestId}] Alert created for tenant ${stat.tenant_id} (${stat.failure_rate_pct}% failure rate)`);

      // Send email notification (if enabled)
      const { data: settings } = await supabaseClient
        .from('tenant_settings')
        .select('enable_email_alerts, alert_email')
        .eq('tenant_id', stat.tenant_id)
        .maybeSingle();

      if (settings?.enable_email_alerts && settings?.alert_email) {
        try {
          await supabaseClient.functions.invoke('send-alert-email', {
            body: {
              to: settings.alert_email,
              subject: `[CyberShield] Alta Taxa de Falha Detectada - ${tenant?.name}`,
              tenant_name: tenant?.name,
              alert_type: 'high_failure_rate',
              severity: stat.failure_rate_pct > 50 ? 'high' : 'medium',
              message: `Taxa de falha de ${stat.failure_rate_pct}% detectada nas instalações.`,
              details: {
                failure_rate: `${stat.failure_rate_pct}%`,
                total_attempts: stat.total_attempts,
                failed_attempts: stat.failed_attempts,
                period: 'última hora',
                threshold: '30%'
              }
            }
          });
          console.log(`[${requestId}] Email sent to ${settings.alert_email}`);
        } catch (emailError) {
          console.error(`[${requestId}] Error sending email:`, emailError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenants_checked: failureStats?.length || 0,
        alerts_created: alertsCreated,
        request_id: requestId
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
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: requestId
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
