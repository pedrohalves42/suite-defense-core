import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createRequestContext, mergeHeaders } from '../_shared/request-context.ts';
import { getDLQEntriesForRetry, calculateNextRetry } from '../_shared/dlq.ts';
import { logger, loggerWithContext } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

// ZERO-GAP: Failure classes that should NEVER be retried
const UNRECOVERABLE_FAILURE_CLASSES = new Set([
  'BUG',
  'EXPIRED',
  'UNKNOWN',
]);

// ZERO-GAP: Error message patterns that indicate permanent failures
const UNRECOVERABLE_ERROR_PATTERNS = [
  'Unknown job type',
  'EXECUTION_ID_REQUIRED',
  'unsupported_version',
  'HMAC secret not configured',
];

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
  failure_class: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

function isUnrecoverable(entry: DLQEntryRow): string | null {
  if (entry.failure_class && UNRECOVERABLE_FAILURE_CLASSES.has(entry.failure_class)) {
    return `Unrecoverable failure_class: ${entry.failure_class}`
  }
  const errorMsg = entry.error_message || ''
  for (const pattern of UNRECOVERABLE_ERROR_PATTERNS) {
    if (errorMsg.includes(pattern)) {
      return `Unrecoverable error pattern: ${pattern}`
    }
  }
  return null
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const ctx = createRequestContext(req, 'process-dlq-retries');
  const log = loggerWithContext(ctx.requestId);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: mergeHeaders(corsHeaders, ctx) });
  }

  // V-1125: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const results = {
    processed: 0,
    retried: 0,
    exhausted: 0,
    skipped_unrecoverable: 0,
    alertsCreated: 0,
    errors: [] as string[],
  };

  try {
    log.info('Starting DLQ retry processing');

    const rawEntries = await getDLQEntriesForRetry(supabase, 20);
    const entries = rawEntries as unknown as DLQEntryRow[];
    
    log.info('Found entries for retry', { count: entries.length });

    if (entries.length === 0) {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'process-dlq-retries',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: { message: 'No DLQ entries to process' },
        p_processed_count: 0,
        p_job_source: 'cron'
      });

      return new Response(
        JSON.stringify({ success: true, requestId: ctx.requestId, results }),
        { status: 200, headers: mergeHeaders(corsHeaders, ctx) }
      );
    }

    for (const entry of entries) {
      results.processed++;

      try {
        // ZERO-GAP: Check if this entry is unrecoverable BEFORE retrying
        const unrecoverableReason = isUnrecoverable(entry)
        if (unrecoverableReason) {
          log.info('Skipping unrecoverable DLQ entry', {
            id: entry.id,
            job_type: entry.job_type,
            failure_class: entry.failure_class,
            reason: unrecoverableReason,
            agent: entry.agent_name,
          })

          // Mark as exhausted immediately ? do NOT create a new job
          await supabase
            .from('failed_jobs_dlq')
            .update({
              status: 'exhausted',
              next_retry_at: null,
              metadata: {
                ...(entry.metadata || {}),
                exhausted_reason: unrecoverableReason,
                exhausted_at: new Date().toISOString(),
              },
            })
            .eq('id', entry.id)

          results.skipped_unrecoverable++
          continue
        }

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
            type: entry.job_type,
            payload: entry.payload,
            status: 'queued',
            approved: true,
          });

        if (jobError) {
          // Dedup index block is acceptable ? skip silently
          if (jobError.message?.includes('idx_jobs_dedup_active')) {
            log.info('DLQ retry skipped: active job already exists', {
              id: entry.id,
              job_type: entry.job_type,
              agent: entry.agent_name,
            })
            // Mark back to pending with delayed retry
            await supabase
              .from('failed_jobs_dlq')
              .update({
                status: 'pending',
                next_retry_at: calculateNextRetry(entry.retry_count + 1),
              })
              .eq('id', entry.id)
            continue
          }
          throw new Error(`Failed to recreate job: ${jobError.message}`);
        }

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

          const { error: alertError } = await supabase
            .from('system_alerts')
            .insert({
              tenant_id: entry.tenant_id,
              agent_id: entry.agent_id,
              alert_type: 'dlq_exhausted',
              severity: 'critical',
              message: `Job "${entry.job_type}" falhou permanentemente apos ${maxRetries} tentativas para ${entry.agent_name}`,
              metadata: {
                dlq_id: entry.id,
                original_job_id: entry.original_job_id,
                job_type: entry.job_type,
                agent_name: entry.agent_name,
                retry_count: newRetryCount,
              },
              resolved: false,
            });

          if (!alertError) results.alertsCreated++;
        } else {
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
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${entry.id}: ${errorMsg}`);
        log.error(`Error processing entry ${entry.id}`, err);

        await supabase
          .from('failed_jobs_dlq')
          .update({ status: 'pending' })
          .eq('id', entry.id);
      }
    }

    logger.metric('dlq_processed', results.processed);
    logger.metric('dlq_retried', results.retried);
    logger.metric('dlq_exhausted', results.exhausted);
    logger.metric('dlq_skipped_unrecoverable', results.skipped_unrecoverable);

    log.timed('DLQ processing complete', results);

    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'process-dlq-retries',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: results,
      p_processed_count: results.processed,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify({ success: true, requestId: ctx.requestId, results }),
      { status: 200, headers: mergeHeaders(corsHeaders, ctx) }
    );
  } catch (err) {
    log.error('Unexpected error', err);

    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'process-dlq-retries',
      p_success: false,
      p_duration_ms: Date.now() - startedAt,
      p_error: err instanceof Error ? err.message : 'Unknown error',
      p_result: results,
      p_processed_count: results.processed,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error', requestId: ctx.requestId }),
      { status: 500, headers: mergeHeaders(corsHeaders, ctx) }
    );
  }
});