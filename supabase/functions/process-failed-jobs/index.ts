import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const ALERT_THRESHOLD = 3; // Create alert after 3 consecutive failures

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[process-failed-jobs] Starting failed jobs processing...');

    // Get failed jobs with retry count < MAX_RETRIES
    const { data: failedJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRIES)
      .order('completed_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch failed jobs: ${fetchError.message}`);
    }

    const results = {
      processed: 0,
      retried: 0,
      alertsCreated: 0,
      exhausted: 0,
      errors: [] as string[],
    };

    if (!failedJobs || failedJobs.length === 0) {
      console.log('[process-failed-jobs] No failed jobs to process');
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[process-failed-jobs] Found ${failedJobs.length} failed jobs to process`);

    for (const job of failedJobs) {
      results.processed++;
      const currentRetry = (job.retry_count || 0) + 1;

      try {
        if (currentRetry >= MAX_RETRIES) {
          // Job exhausted - create alert and mark as permanently failed
          results.exhausted++;

          // Create system alert
          const { error: alertError } = await supabase
            .from('system_alerts')
            .insert({
              tenant_id: job.tenant_id,
              agent_id: job.agent_id,
              alert_type: 'job_failure_exhausted',
              severity: 'high',
              message: `Job "${job.type}" falhou ${MAX_RETRIES} vezes consecutivas para o agente ${job.agent_name}`,
              metadata: {
                job_id: job.id,
                job_type: job.type,
                agent_name: job.agent_name,
                last_error: job.error_message,
                retry_count: currentRetry,
              },
              resolved: false,
            });

          if (!alertError) {
            results.alertsCreated++;
          }

          // Update job to mark as permanently failed
          await supabase
            .from('jobs')
            .update({
              retry_count: currentRetry,
              error_message: `[EXHAUSTED] ${job.error_message || 'Max retries reached'}`,
            })
            .eq('id', job.id);

          // Insert into DLQ if not already there
          await supabase
            .from('failed_jobs_dlq')
            .upsert({
              original_job_id: job.id,
              tenant_id: job.tenant_id,
              agent_id: job.agent_id,
              agent_name: job.agent_name,
              job_type: job.type,
              payload: job.payload,
              error_count: currentRetry,
              retry_count: currentRetry,
              max_retries: MAX_RETRIES,
              status: 'exhausted',
              last_error: job.error_message,
              failed_at: new Date().toISOString(),
            }, { onConflict: 'original_job_id' });

        } else {
          // Retry the job
          const { error: createError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: job.tenant_id,
              agent_id: job.agent_id,
              agent_name: job.agent_name,
              type: job.type,
              payload: job.payload,
              status: 'queued',
              approved: job.approved,
              retry_count: currentRetry,
              parent_job_id: job.id,
            });

          if (createError) {
            throw new Error(`Failed to create retry job: ${createError.message}`);
          }

          // Update original job
          await supabase
            .from('jobs')
            .update({
              retry_count: currentRetry,
              error_message: `[RETRY ${currentRetry}/${MAX_RETRIES}] ${job.error_message || 'Unknown error'}`,
            })
            .eq('id', job.id);

          results.retried++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Job ${job.id}: ${errorMsg}`);
      }
    }

    console.log('[process-failed-jobs] Processing complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[process-failed-jobs] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
