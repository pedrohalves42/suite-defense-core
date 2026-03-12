/**
 * Security Cleanup Cron Job
 * 
 * P1 - Scheduled cleanup routine for security-related data
 * Runs daily to clean up:
 * - Old HMAC signatures (>24h)
 * - Expired rate limits (>7 days)
 * - Old failed login attempts (>30 days)
 * - Expired IP blocklist entries
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsSecurityHeaders, secureJsonResponse, secureCorsPreflightResponse, secureErrorResponse } from '../_shared/security-headers.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CleanupStats {
  hmac_signatures_deleted: number;
  rate_limits_deleted: number;
  failed_logins_deleted: number;
  ip_blocklist_deleted: number;
  old_metrics_deleted: number;
  security_logs_archived: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return secureCorsPreflightResponse();
  }

  // V-1115: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  console.log(`[${requestId}] Security cleanup cron started`);

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    
    const stats: CleanupStats = {
      hmac_signatures_deleted: 0,
      rate_limits_deleted: 0,
      failed_logins_deleted: 0,
      ip_blocklist_deleted: 0,
      old_metrics_deleted: 0,
      security_logs_archived: 0,
    };

    // 1. Cleanup HMAC signatures > 24h (anti-replay records)
    // ADR-029: Tabela foi corrigida para ter estrutura correta (id, signature, agent_name, used_at)
    const hmacCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { data: hmacDeleted, error: hmacError } = await supabase
      .from('hmac_signatures')
      .delete()
      .lt('used_at', hmacCutoff.toISOString())
      .select('id');
    
    if (hmacError) {
      console.error(`[${requestId}] HMAC cleanup error:`, hmacError);
    }
    stats.hmac_signatures_deleted = hmacDeleted?.length || 0;
    console.log(`[${requestId}] Deleted ${stats.hmac_signatures_deleted} old HMAC signatures`);

    // 2. Cleanup rate_limits > 2 hours (P1 optimization - reduced from 7 days)
    const rateLimitCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const { data: rateLimitsDeleted, error: rlError } = await supabase
      .from('rate_limits')
      .delete()
      .lt('window_start', rateLimitCutoff.toISOString())
      .select('id');
    
    stats.rate_limits_deleted = rateLimitsDeleted?.length || 0;
    console.log(`[${requestId}] Deleted ${stats.rate_limits_deleted} old rate limits`);

    // 3. Cleanup failed_login_attempts > 30 days
    const failedLoginCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const { data: failedLoginsDeleted, error: flError } = await supabase
      .from('failed_login_attempts')
      .delete()
      .lt('created_at', failedLoginCutoff.toISOString())
      .select('id');
    
    stats.failed_logins_deleted = failedLoginsDeleted?.length || 0;
    console.log(`[${requestId}] Deleted ${stats.failed_logins_deleted} old failed login attempts`);

    // 4. Cleanup expired IP blocklist entries
    const { data: ipBlocklistDeleted, error: ipError } = await supabase
      .from('ip_blocklist')
      .delete()
      .lt('blocked_until', now.toISOString())
      .select('id');
    
    stats.ip_blocklist_deleted = ipBlocklistDeleted?.length || 0;
    console.log(`[${requestId}] Deleted ${stats.ip_blocklist_deleted} expired IP blocklist entries`);

    // 5. Cleanup old agent_system_metrics > 30 days
    const metricsCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const { data: metricsDeleted, error: metricsError } = await supabase
      .from('agent_system_metrics_partitioned')
      .delete()
      .lt('collected_at', metricsCutoff.toISOString())
      .select('id');
    
    stats.old_metrics_deleted = metricsDeleted?.length || 0;
    console.log(`[${requestId}] Deleted ${stats.old_metrics_deleted} old system metrics`);

    // 6. Archive/cleanup security_logs > 90 days
    const securityLogsCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const { data: securityLogsDeleted, error: slError } = await supabase
      .from('security_logs')
      .delete()
      .lt('created_at', securityLogsCutoff.toISOString())
      .select('id');
    
    stats.security_logs_archived = securityLogsDeleted?.length || 0;
    console.log(`[${requestId}] Archived ${stats.security_logs_archived} old security logs`);

    // Calculate execution time
    const executionTime = Date.now() - startTime;

    // Log cleanup summary
    await supabase.from('audit_logs').insert({
      action: 'security_cleanup',
      resource_type: 'system',
      success: true,
      details: {
        request_id: requestId,
        stats,
        execution_time_ms: executionTime,
        run_at: now.toISOString(),
      },
    });

    const totalDeleted = Object.values(stats).reduce((a, b) => a + b, 0);
    console.log(`[${requestId}] Security cleanup complete. Total deleted: ${totalDeleted}. Time: ${executionTime}ms`);

    // Log observability to scheduled_job_runs
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'security-cleanup-cron',
      p_success: true,
      p_duration_ms: executionTime,
      p_result: stats,
      p_processed_count: totalDeleted,
      p_job_source: 'cron'
    });

    return secureJsonResponse({
      success: true,
      request_id: requestId,
      stats,
      total_deleted: totalDeleted,
      execution_time_ms: executionTime,
      next_run: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] Error:`, error);
    
    // Log error observability
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'security-cleanup-cron',
        p_success: false,
        p_duration_ms: Date.now() - startTime,
        p_error: errorMessage,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) { console.warn('[security-cleanup-cron] Failed to log error:', logErr); }
    
    return secureErrorResponse(
      'Security cleanup failed',
      500,
      { request_id: requestId, error: errorMessage }
    );
  }
});
