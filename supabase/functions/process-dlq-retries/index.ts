import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createRequestContext, mergeHeaders } from '../_shared/request-context.ts';
import { getDLQEntriesForRetry, calculateNextRetry } from '../_shared/dlq.ts';
import { logger, loggerWithContext } from '../_shared/logger.ts';

// P3: Type-safe DLQ entry interface
interface DLQEntryRow {
  id: string;
  original_job_id: string;
  tenant_id: string;
  agent_id: string | null;
  agent_name: string;
  job_type: string;
  payload: Record<string, unknown> | null;
  error_count: number;
  retry_count: number;
  max_retries: number;
  status: string;
  metadata: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  const ctx = createRequestContext(req, 'process-dlq-retries');
  const log = loggerWithContext(ctx.requestId);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: mergeHeaders(corsHeaders, ctx) });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', requestId: ctx.requestId }),
      { status: 405, headers: mergeHeaders(corsHeaders, ctx) }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    log.info('Starting DLQ retry processing');

    // Get entries ready for retry with proper typing
    const rawEntries = await getDLQEntriesForRetry(supabase, 20);
    const entries = rawEntries as unknown as DLQEntryRow[];
    
    log.info('Found entries for retry', { count: entries.length });

    const results = {
      processed: 0,
      retried: 0,
      exhausted: 0,
      errors: [] as string[],
    };

    for (const entry of entries) {
      results.processed++;
      const entryStartTime = Date.now();

      try {
        // Mark as retrying
        await supabase
          .from('failed_jobs_dlq')
          .update({ status: 'retrying' })
          .eq('id', entry.id);

        // Re-create the job
        const { error: jobError } = await supabase
          .from('jobs')
          .insert({
            tenant_id: entry.tenant_id,
            agent_id: entry.agent_id,
            agent_name: entry.agent_name,
            job_type: entry.job_type,
            payload: entry.payload,
            status: 'queued',
          });

        if (jobError) {
          throw new Error(`Failed to recreate job: ${jobError.message}`);
        }

        // P3: Type-safe retry count calculation
        const currentRetryCount = typeof entry.retry_count === 'number' ? entry.retry_count : 0;
        const maxRetries = typeof entry.max_retries === 'number' ? entry.max_retries : 3;
        const newRetryCount = currentRetryCount + 1;
        const exhausted = newRetryCount >= maxRetries;

        if (exhausted) {
          await supabase
            .from('failed_jobs_dlq')
            .update({
              status: 'exhausted',
              retry_count: newRetryCount,
              next_retry_at: null,
            })
            .eq('id', entry.id);
          results.exhausted++;
        } else {
          // P2: Use shared calculateNextRetry function
          const nextRetry = calculateNextRetry(newRetryCount);

          await supabase
            .from('failed_jobs_dlq')
            .update({
              status: 'pending',
              retry_count: newRetryCount,
              next_retry_at: nextRetry,
            })
            .eq('id', entry.id);
          results.retried++;
        }

        // P3: Log with timing
        logger.span('dlq_entry_processed', entryStartTime, {
          entry_id: entry.id,
          retry_count: newRetryCount,
          exhausted,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${entry.id}: ${errorMsg}`);
        log.error(`Error processing entry ${entry.id}`, err);

        // Reset to pending for next attempt
        await supabase
          .from('failed_jobs_dlq')
          .update({ status: 'pending' })
          .eq('id', entry.id);
      }
    }

    // P3: Log metrics
    logger.metric('dlq_processed', results.processed);
    logger.metric('dlq_retried', results.retried);
    logger.metric('dlq_exhausted', results.exhausted);
    logger.metric('dlq_errors', results.errors.length);

    log.timed('DLQ processing complete', results);

    return new Response(
      JSON.stringify({
        success: true,
        requestId: ctx.requestId,
        results,
      }),
      { status: 200, headers: mergeHeaders(corsHeaders, ctx) }
    );
  } catch (err) {
    log.error('Unexpected error', err);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        requestId: ctx.requestId 
      }),
      { status: 500, headers: mergeHeaders(corsHeaders, ctx) }
    );
  }
});
