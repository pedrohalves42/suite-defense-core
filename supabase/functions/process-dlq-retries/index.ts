import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createRequestContext, mergeHeaders } from '../_shared/request-context.ts';
import { getDLQEntriesForRetry } from '../_shared/dlq.ts';

Deno.serve(async (req) => {
  const ctx = createRequestContext(req, 'process-dlq-retries');
  
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

    console.log(`[${ctx.requestId}] Starting DLQ retry processing`);

    // Get entries ready for retry
    const entries = await getDLQEntriesForRetry(supabase, 20);
    console.log(`[${ctx.requestId}] Found ${entries.length} entries for retry`);

    const results = {
      processed: 0,
      retried: 0,
      exhausted: 0,
      errors: [] as string[],
    };

    for (const entry of entries) {
      results.processed++;

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

        // Calculate next retry or mark exhausted
        const newRetryCount = (entry.retry_count || 0) + 1;
        const exhausted = newRetryCount >= (entry.max_retries || 3);

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
          // Calculate next retry with exponential backoff
          const delays = [60, 300, 900, 1800];
          const delay = delays[Math.min(newRetryCount, delays.length - 1)];
          const nextRetry = new Date(Date.now() + delay * 1000).toISOString();

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

        console.log(`[${ctx.requestId}] Processed DLQ entry ${entry.id}, retry=${newRetryCount}, exhausted=${exhausted}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${entry.id}: ${errorMsg}`);
        console.error(`[${ctx.requestId}] Error processing ${entry.id}:`, err);

        // Reset to pending for next attempt
        await supabase
          .from('failed_jobs_dlq')
          .update({ status: 'pending' })
          .eq('id', entry.id);
      }
    }

    console.log(`[${ctx.requestId}] DLQ processing complete:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        requestId: ctx.requestId,
        results,
      }),
      { status: 200, headers: mergeHeaders(corsHeaders, ctx) }
    );
  } catch (err) {
    console.error(`[${ctx.requestId}] Unexpected error:`, err);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        requestId: ctx.requestId 
      }),
      { status: 500, headers: mergeHeaders(corsHeaders, ctx) }
    );
  }
});
