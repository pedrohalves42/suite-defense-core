import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface QuotaAlert {
  tenant_id: string;
  tenant_name: string;
  feature_key: string;
  quota_used: number;
  quota_limit: number;
  usage_percentage: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept either internal secret OR valid JWT (for cron jobs)
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');
  const authHeader = req.headers.get('Authorization');

  const hasValidSecret = providedSecret === INTERNAL_SECRET;
  const hasJWT = authHeader && authHeader.startsWith('Bearer ');
  
  if (!hasValidSecret && !hasJWT) {
    console.error('[Quota Check] Unauthorized access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting quota monitoring`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all tenant features with quotas
    const { data: features, error: featuresError } = await supabase
      .from('tenant_features')
      .select(`
        *,
        tenants!inner (
          id,
          name
        )
      `)
      .not('quota_limit', 'is', null)
      .gt('quota_limit', 0);

    if (featuresError) {
      console.error(`[${requestId}] Error fetching features:`, featuresError);
      throw featuresError;
    }

    console.log(`[${requestId}] Checking ${features?.length || 0} quota features`);

    const alerts: QuotaAlert[] = [];

    for (const feature of features || []) {
      const usagePercentage = (feature.quota_used / feature.quota_limit) * 100;
      const threshold = feature.quota_warning_threshold || 80;

      // Check if usage exceeds threshold
      if (usagePercentage >= threshold) {
        const tenant = Array.isArray(feature.tenants) ? feature.tenants[0] : feature.tenants;
        
        alerts.push({
          tenant_id: feature.tenant_id,
          tenant_name: tenant.name,
          feature_key: feature.feature_key,
          quota_used: feature.quota_used,
          quota_limit: feature.quota_limit,
          usage_percentage: Math.round(usagePercentage * 100) / 100,
        });

        console.log(`[${requestId}] Quota alert for ${tenant.name}: ${feature.feature_key} at ${usagePercentage.toFixed(1)}%`);
      }
    }

    // Send alerts
    const alertResults = [];
    for (const alert of alerts) {
      try {
        const message = `Limite de quota próximo: ${alert.feature_key}`;
        const details = {
          feature: alert.feature_key,
          usage: `${alert.quota_used} de ${alert.quota_limit}`,
          percentage: `${alert.usage_percentage}%`,
          tenant: alert.tenant_name,
          warning: alert.usage_percentage >= 100 
            ? 'Quota excedida! Funcionalidade pode ser bloqueada.' 
            : 'Atenção: Você está próximo do limite de quota.',
        };

        // Call send-system-alert edge function
        const { data: alertData, error: alertError } = await supabase.functions.invoke('send-system-alert', {
          headers: {
            'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
          },
          body: {
            event_type: 'quota_warning',
            severity: alert.usage_percentage >= 100 ? 'critical' : 'medium',
            message,
            details,
            tenant_id: alert.tenant_id
          }
        });

        if (alertError) {
          console.error(`[${requestId}] Error sending alert for tenant ${alert.tenant_id}:`, alertError);
          alertResults.push({
            tenant_id: alert.tenant_id,
            feature_key: alert.feature_key,
            success: false,
            error: alertError.message
          });
        } else {
          console.log(`[${requestId}] Alert sent successfully for ${alert.tenant_name}`);
          alertResults.push({
            tenant_id: alert.tenant_id,
            feature_key: alert.feature_key,
            success: true,
            data: alertData
          });
        }
      } catch (error) {
        console.error(`[${requestId}] Error processing alert:`, error);
        alertResults.push({
          tenant_id: alert.tenant_id,
          feature_key: alert.feature_key,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const result = {
      success: true,
      checked_features: features?.length || 0,
      alerts_triggered: alerts.length,
      alerts_sent: alertResults.filter(r => r.success).length,
      alert_results: alertResults,
      timestamp: new Date().toISOString()
    };

    console.log(`[${requestId}] Quota monitoring completed:`, result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Fatal error:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});