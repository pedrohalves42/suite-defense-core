import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;

const RETRYABLE_CLASSES = ['TRANSIENT'];

const DLQ_CLASSES = [
  'AGENT_OFFLINE',
  'AGENT_STALLED',
  'AGENT_INCOMPATIBLE',
  'CASCADE_FAILURE',
  'BUG',
  'POLICY',
  'SECURITY'
];

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1142: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const results = {
    processed: 0,
    retried: 0,
    sentToDlq: 0,
    alertsCreated: 0,
    exhausted: 0,
    byClass: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    logger.info('[process-failed-jobs] Starting intelligent failed jobs processing...');

    // Get failed jobs with retry count < MAX_RETRIES
    // Agora inclui failure_class para decisao inteligente
    const { data: failedJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, tenant_id, agent_id, agent_name, type, payload, status, approved, error_message, retry_count, failure_class')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRIES)
      .order('completed_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch failed jobs: ${fetchError.message}`);
    }

    if (!failedJobs || failedJobs.length === 0) {
      logger.info('[process-failed-jobs] No failed jobs to process');
      
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'process-failed-jobs',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { message: 'No failed jobs to process' },
        p_processed_count: 0,
        p_job_source: 'cron'
      });
      
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[process-failed-jobs] Found ${failedJobs.length} failed jobs to process`);

    for (const job of failedJobs) {
      results.processed++;
      const currentRetry = (job.retry_count || 0) + 1;
      const failureClass = job.failure_class || 'BUG';
      
      // Contabilizar por classe
      results.byClass[failureClass] = (results.byClass[failureClass] || 0) + 1;

      try {
        // Decisao inteligente: retry ou DLQ
        const shouldRetry = RETRYABLE_CLASSES.includes(failureClass) && currentRetry < MAX_RETRIES;
        const shouldDlq = DLQ_CLASSES.includes(failureClass) || currentRetry >= MAX_RETRIES;

        if (shouldDlq) {
          // Enviar direto para DLQ (sem retry inutil)
          logger.info(`[process-failed-jobs] Job ${job.id} -> DLQ (class: ${failureClass}, retries: ${currentRetry})`);
          
          results.sentToDlq++;
          if (currentRetry >= MAX_RETRIES) {
            results.exhausted++;
          }

          // Create system alert for non-expected failures
          if (failureClass !== 'EXPECTED_DROP') {
            const { error: alertError } = await supabase
              .from('system_alerts')
              .insert({
                tenant_id: job.tenant_id,
                agent_id: job.agent_id,
                alert_type: 'job_failure_dlq',
                severity: failureClass === 'SECURITY' ? 'critical' : 'high',
                message: `Job "${job.type}" enviado para DLQ: ${failureClass}`,
                metadata: {
                  job_id: job.id,
                  job_type: job.type,
                  agent_name: job.agent_name,
                  failure_class: failureClass,
                  last_error: job.error_message,
                  retry_count: currentRetry,
                },
                resolved: false,
              });

            if (!alertError) {
              results.alertsCreated++;
            }
          }

          // Insert into DLQ com failure_class
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
              status: 'dlq',
              last_error: job.error_message,
              failure_class: failureClass,
              failed_at: new Date().toISOString(),
            }, { onConflict: 'original_job_id' });

          // Marcar job original como processado (nao tentar novamente)
          await supabase
            .from('jobs')
            .update({
              retry_count: MAX_RETRIES, // Impede reprocessamento
              error_message: `[DLQ:${failureClass}] ${job.error_message || 'Sent to DLQ'}`,
            })
            .eq('id', job.id);

        } else if (shouldRetry) {
          // Retry apenas para TRANSIENT
          logger.info(`[process-failed-jobs] Job ${job.id} -> RETRY (class: ${failureClass}, attempt: ${currentRetry}/${MAX_RETRIES})`);

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

    logger.info('[process-failed-jobs] Processing complete:', results);

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'process-failed-jobs',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: results,
      p_processed_count: results.processed,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('[process-failed-jobs] Error:', error);
    
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'process-failed-jobs',
      p_success: false,
      p_duration_ms: Date.now() - startedAt,
      p_error: error instanceof Error ? error.message : 'Unknown error',
      p_result: results,
      p_processed_count: results.processed,
      p_job_source: 'cron'
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
