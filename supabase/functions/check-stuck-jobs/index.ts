/**
 * P1-01: Alerta de Jobs Stuck
 * Detecta jobs em status "delivered" por mais de 30 minutos e gera alertas
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface StuckJob {
  id: string;
  agent_name: string;
  type: string;
  delivered_at: string;
  tenant_id: string;
  minutes_stuck: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting stuck jobs check`);

  // Validate internal secret for scheduled/internal calls
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');
  
  // Allow both internal secret and scheduled execution (no auth header)
  const isScheduled = !providedSecret && req.headers.get('authorization') === null;
  const isInternal = providedSecret === INTERNAL_SECRET;
  
  if (!isScheduled && !isInternal) {
    console.warn(`[${requestId}] Unauthorized access attempt`);
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Jobs stuck for more than 30 minutes
    const STUCK_THRESHOLD_MINUTES = 30;
    const cutoffTime = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    // Fetch stuck jobs
    const { data: stuckJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivered_at, tenant_id')
      .eq('status', 'delivered')
      .lt('delivered_at', cutoffTime);

    if (fetchError) {
      console.error(`[${requestId}] Error fetching stuck jobs:`, fetchError);
      throw fetchError;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log(`[${requestId}] No stuck jobs found`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          stuck_jobs: 0, 
          alerts_created: 0,
          timestamp: new Date().toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Found ${stuckJobs.length} stuck jobs`);

    // Calculate minutes stuck and group by tenant
    const jobsByTenant: Record<string, StuckJob[]> = {};
    
    for (const job of stuckJobs) {
      const deliveredAt = new Date(job.delivered_at);
      const minutesStuck = Math.floor((Date.now() - deliveredAt.getTime()) / (1000 * 60));
      
      const stuckJob: StuckJob = {
        ...job,
        minutes_stuck: minutesStuck
      };

      if (!jobsByTenant[job.tenant_id]) {
        jobsByTenant[job.tenant_id] = [];
      }
      jobsByTenant[job.tenant_id].push(stuckJob);
    }

    // Create alerts for each tenant
    let alertsCreated = 0;
    const alertResults: { tenant_id: string; success: boolean; error?: string }[] = [];

    for (const [tenantId, jobs] of Object.entries(jobsByTenant)) {
      try {
        // Determine severity based on time stuck
        const maxMinutesStuck = Math.max(...jobs.map(j => j.minutes_stuck));
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        
        if (maxMinutesStuck >= 120) {
          severity = 'critical';
        } else if (maxMinutesStuck >= 60) {
          severity = 'high';
        }

        // Create system alert
        const { error: alertError } = await supabase
          .from('system_alerts')
          .insert({
            tenant_id: tenantId,
            alert_type: 'stuck_jobs',
            severity,
            message: `${jobs.length} job(s) travado(s) em estado "delivered" por mais de ${STUCK_THRESHOLD_MINUTES} minutos`,
            metadata: {
              job_count: jobs.length,
              max_minutes_stuck: maxMinutesStuck,
              jobs: jobs.map(j => ({
                id: j.id,
                type: j.type,
                agent_name: j.agent_name,
                minutes_stuck: j.minutes_stuck
              }))
            }
          });

        if (alertError) {
          console.error(`[${requestId}] Error creating alert for tenant ${tenantId}:`, alertError);
          alertResults.push({ tenant_id: tenantId, success: false, error: alertError.message });
        } else {
          alertsCreated++;
          alertResults.push({ tenant_id: tenantId, success: true });
          console.log(`[${requestId}] Alert created for tenant ${tenantId}: ${jobs.length} stuck jobs`);
        }

        // Log security event
        await supabase
          .from('security_logs')
          .insert({
            tenant_id: tenantId,
            event_type: 'stuck_jobs_detected',
            severity,
            details: {
              job_count: jobs.length,
              max_minutes_stuck: maxMinutesStuck,
              job_ids: jobs.map(j => j.id)
            }
          });

      } catch (error) {
        console.error(`[${requestId}] Error processing tenant ${tenantId}:`, error);
        alertResults.push({ 
          tenant_id: tenantId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    const result = {
      success: true,
      stuck_jobs: stuckJobs.length,
      tenants_affected: Object.keys(jobsByTenant).length,
      alerts_created: alertsCreated,
      alert_results: alertResults,
      timestamp: new Date().toISOString()
    };

    console.log(`[${requestId}] Check completed:`, result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Fatal error:`, error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
