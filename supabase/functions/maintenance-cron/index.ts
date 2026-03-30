/**
 * maintenance-cron - Consolidated maintenance function (COST-OPT v9)
 * MODULARIZED: Phase handlers in phase-handlers.ts
 * 
 * Auth: Deno.serve + assertInternalCaller
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from "../_shared/cors.ts";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { recordMetric } from '../_shared/apm.ts';
import { logger } from '../_shared/logger.ts';
import { createEmptyResult, runMaintenanceRpc, cleanupStuckJobs, autoCleanupJobs, runRemainingPhases, computeTotalOps } from './phase-handlers.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const startTime = Date.now();
  const now = new Date().toISOString();
  const result = createEmptyResult();

  try {
    await runMaintenanceRpc(supabase, result);
    await cleanupStuckJobs(supabase, now, result);
    await autoCleanupJobs(supabase, now, result);
    await runRemainingPhases(supabase, now, result);

    result.duration_ms = Date.now() - startTime;
    result.total_operations = computeTotalOps(result);

    logger.info(`[maintenance-cron] Completed in ${result.duration_ms}ms: ${result.total_operations} operations`);

    recordMetric({ function_name: 'maintenance-cron', operation_type: 'edge_function', duration_ms: result.duration_ms, status_code: 200, metadata: result as unknown as Record<string, any> }).catch(() => {});
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'maintenance-cron-consolidated', p_success: true, p_duration_ms: result.duration_ms, p_result: result, p_processed_count: result.total_operations, p_job_source: 'cron' }); } catch { /* non-critical */ }
    try { await supabase.rpc('update_cron_health', { p_cron_name: 'maintenance-cron', p_success: true, p_details: result }); } catch { /* non-critical */ }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    const err = error as Error;
    logger.error('[maintenance-cron] Fatal error:', err.message);
    result.duration_ms = Date.now() - startTime;
    try { await supabase.rpc('mark_cron_failure', { p_cron_name: 'maintenance-cron', p_error: err.message }); } catch { /* non-critical */ }
    return new Response(JSON.stringify({ success: false, error: err.message, ...result }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
