/**
 * Handler: Security Cleanup
 * Purges expired HMAC signatures, rate limits, failed logins, IP blocklist, old metrics, security logs.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function handleSecurityCleanup(supabase: SupabaseClient, requestId: string) {
  const now = new Date();
  const stats = { hmac_signatures_deleted: 0, rate_limits_deleted: 0, failed_logins_deleted: 0, ip_blocklist_deleted: 0, old_metrics_deleted: 0, security_logs_archived: 0 };

  // 1. HMAC signatures > 24h
  const hmacCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { data: hmacDeleted } = await supabase.from('hmac_signatures').delete().lt('used_at', hmacCutoff.toISOString()).select('id');
  stats.hmac_signatures_deleted = hmacDeleted?.length || 0;

  // 2. Rate limits > 2h
  const rlCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const { data: rlDeleted } = await supabase.from('rate_limits').delete().lt('window_start', rlCutoff.toISOString()).select('id');
  stats.rate_limits_deleted = rlDeleted?.length || 0;

  // 3. Failed logins > 30 days
  const flCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: flDeleted } = await supabase.from('failed_login_attempts').delete().lt('created_at', flCutoff.toISOString()).select('id');
  stats.failed_logins_deleted = flDeleted?.length || 0;

  // 4. Expired IP blocklist
  const { data: ipDeleted } = await supabase.from('ip_blocklist').delete().lt('blocked_until', now.toISOString()).select('id');
  stats.ip_blocklist_deleted = ipDeleted?.length || 0;

  // 5. Old metrics > 30 days
  const metricsCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: metricsDeleted } = await supabase.from('agent_system_metrics_partitioned').delete().lt('collected_at', metricsCutoff.toISOString()).select('id');
  stats.old_metrics_deleted = metricsDeleted?.length || 0;

  // 6. Security logs > 90 days
  const slCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const { data: slDeleted } = await supabase.from('security_logs').delete().lt('created_at', slCutoff.toISOString()).select('id');
  stats.security_logs_archived = slDeleted?.length || 0;

  await supabase.from('audit_logs').insert({ action: 'security_cleanup', resource_type: 'system', success: true, details: { request_id: requestId, stats, run_at: now.toISOString() } });

  const totalDeleted = Object.values(stats).reduce((a, b) => a + b, 0);
  return { success: true, stats, total_deleted: totalDeleted };
}
