import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const TIMEOUT_MINUTES = 30;

Deno.serve(async (req) => {
  const startedAt = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1112: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const results = {
    processed: 0,
    cleaned: 0,
    alertsCreated: 0,
    errors: [] as string[],
  };

  try {
    logger.info('[cleanup-stale-playbooks] Starting cleanup...');

    const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();

    // Find stale playbook executions
    const { data: staleExecutions, error: fetchError } = await supabase
      .from('playbook_executions')
      .select('id, playbook_id, tenant_id, started_at, status')
      .in('status', ['pending', 'in_progress'])
      .lt('started_at', cutoffTime);

    if (fetchError) {
      throw new Error(`Failed to fetch stale executions: ${fetchError.message}`);
    }

    if (!staleExecutions || staleExecutions.length === 0) {
      logger.info('[cleanup-stale-playbooks] No stale executions found');
      
      // Log observability using RPC with job_key
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'cleanup-stale-playbooks',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { message: 'No stale executions found' },
        p_processed_count: 0,
        p_job_source: 'cron'
      });

      return new Response(
        JSON.stringify({ success: true, cleaned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[cleanup-stale-playbooks] Found ${staleExecutions.length} stale executions`);

    for (const execution of staleExecutions) {
      results.processed++;
      
      try {
        // Update execution status to failed
        const { error: updateError } = await supabase
          .from('playbook_executions')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            notes: `Timeout automatico: execucao excedeu ${TIMEOUT_MINUTES} minutos sem conclusao`,
          })
          .eq('id', execution.id);

        if (updateError) {
          results.errors.push(`Failed to update execution ${execution.id}: ${updateError.message}`);
          continue;
        }

        results.cleaned++;

        // Create system alert for admin visibility
        const { error: alertError } = await supabase
          .from('system_alerts')
          .insert({
            tenant_id: execution.tenant_id,
            alert_type: 'playbook_timeout',
            severity: 'high',
            message: `Execucao de playbook travada por mais de ${TIMEOUT_MINUTES} minutos foi automaticamente marcada como falha`,
            metadata: {
              execution_id: execution.id,
              playbook_id: execution.playbook_id,
              started_at: execution.started_at,
              original_status: execution.status,
            },
            resolved: false,
          });

        if (!alertError) {
          results.alertsCreated++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Error processing execution ${execution.id}: ${errorMsg}`);
      }
    }

    logger.info('[cleanup-stale-playbooks] Cleanup complete:', results);

    // Log observability - success using RPC with job_key
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'cleanup-stale-playbooks',
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
    logger.error('[cleanup-stale-playbooks] Error:', error);

    // Log observability - failure using RPC with job_key
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'cleanup-stale-playbooks',
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
