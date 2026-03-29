/**
 * detect-blocked-attempts - Correlates blocked access attempts
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  // Timeout via race
  const timeoutMs = 20000;
  const rpcPromise = supabase.rpc('detect_blocked_access_attempts');
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('RPC timeout after 20s')), timeoutMs)
  );

  const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: unknown; error: Record<string, unknown> | null };

  if (error) {
    const isTimeout = error.code === '57014' || (error.message as string)?.includes('timeout');
    logger.error(`[${requestId}] Detection ${isTimeout ? 'timed out' : 'failed'}:`, error);

    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'detect-blocked-attempts', p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: isTimeout ? 'RPC timeout' : (error.message as string),
        p_result: null, p_processed_count: 0, p_job_source: 'cron',
      });
    } catch (_e) { /* best effort */ }

    return new Response(
      JSON.stringify({
        status: isTimeout ? 'timeout' : 'error',
        error: isTimeout ? 'Query timed out' : (error.message as string),
        requestId,
      }),
      { status: isTimeout ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const insertedCount = (data as Record<string, unknown>[])?.[0]?.inserted_count ?? 0;
  logger.info(`[${requestId}] Detected ${insertedCount} new blocked attempts in ${Date.now() - startedAt}ms`);

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'detect-blocked-attempts', p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: { inserted_count: insertedCount },
      p_processed_count: insertedCount as number, p_job_source: 'cron',
    });
  } catch (_e) { /* best effort */ }

  return { status: 'ok', inserted_count: insertedCount, duration_ms: Date.now() - startedAt, requestId };
});
