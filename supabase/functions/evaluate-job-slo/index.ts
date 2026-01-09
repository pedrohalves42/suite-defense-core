import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[evaluate-job-slo] Starting SLO evaluation...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Call the database function that evaluates SLOs and creates tasks
    const { data, error } = await supabase.rpc('evaluate_job_slo');

    if (error) {
      console.error('[evaluate-job-slo] Error evaluating SLO:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message 
        }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Log results
    const results = data || [];
    const tasksCreated = results.filter((r: any) => r.out_task_created).length;
    const highBurnRates = results.filter((r: any) => r.out_burn_rate >= 2);

    console.log(`[evaluate-job-slo] Evaluation complete:`, {
      tenantsEvaluated: results.length,
      tasksCreated,
      highBurnRates: highBurnRates.length,
      timestamp: new Date().toISOString()
    });

    // Log high burn rate warnings
    for (const result of highBurnRates) {
      console.warn(`[evaluate-job-slo] HIGH BURN RATE detected:`, {
        tenantId: result.out_tenant_id,
        burnRate: result.out_burn_rate,
        errorRate: result.out_error_rate,
        severity: result.out_severity,
        taskCreated: result.out_task_created
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        evaluated: results.length,
        tasksCreated,
        highBurnRates: highBurnRates.length,
        results: results.map((r: any) => ({
          tenantId: r.out_tenant_id,
          window: r.out_time_window,
          burnRate: Number(r.out_burn_rate).toFixed(2),
          errorRate: (Number(r.out_error_rate) * 100).toFixed(2) + '%',
          severity: r.out_severity,
          taskCreated: r.out_task_created
        })),
        timestamp: new Date().toISOString()
      }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[evaluate-job-slo] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
