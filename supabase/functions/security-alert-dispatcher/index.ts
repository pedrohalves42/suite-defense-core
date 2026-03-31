/**
 * Security Alert Dispatcher — Cron security scanner
 * Migrated to serveInternal middleware.
 *
 * Monitors: rate limit breaches, replay attempts, failed login spikes,
 * critical security events, cron job silence.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
import {
  healthProbeMiddleware,
  updateJobHeartbeat,
  EDGE_VERSION,
} from '../_shared/health-probe.ts';
import { logger } from '../_shared/logger.ts';

interface SecurityMetrics {
  rate_limit_breaches: number;
  replay_attempts: number;
  failed_logins: number;
  blocked_ips: number;
  critical_events: number;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  logger.info(`[${requestId}] Security alert dispatcher started - Edge v${EDGE_VERSION}`);

  // Health probe — emergency mode & schema validation
  const healthCheck = await healthProbeMiddleware(supabase, {});
  if (healthCheck) return healthCheck;

  // Update heartbeat for cron silence monitoring
  await updateJobHeartbeat(supabase, 'security-alert-dispatcher', '5 minutes');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  // 1. Check rate limit breaches (last hour)
  const { data: rateLimitData } = await supabase
    .from('rate_limits')
    .select('*')
    .gte('window_start', oneHourAgo.toISOString())
    .not('blocked_until', 'is', null);

  const rateLimitBreaches = rateLimitData?.length || 0;
  logger.info(`[${requestId}] Rate limit breaches: ${rateLimitBreaches}`);

  // 2. Check for replay attempts (duplicate HMAC signatures)
  const { data: replayData } = await supabase
    .rpc('get_replay_attempts', { hours_back: 1 });

  const replayAttempts = replayData?.[0]?.attempt_count || 0;
  logger.info(`[${requestId}] Replay attempts: ${replayAttempts}`);

  // 3. Check failed login spikes (last 10 minutes)
  const { data: failedLoginData } = await supabase
    .from('failed_login_attempts')
    .select('ip_address, count(*)', { count: 'exact' })
    .gte('created_at', tenMinutesAgo.toISOString());

  const ipCounts: Record<string, number> = {};
  failedLoginData?.forEach((attempt: Record<string, unknown>) => {
    const ip = attempt.ip_address as string;
    ipCounts[ip] = (ipCounts[ip] || 0) + 1;
  });

  const failedLoginSpikes = Object.entries(ipCounts)
    .filter(([, count]) => count >= 5)
    .length;
  logger.info(`[${requestId}] Failed login spikes: ${failedLoginSpikes}`);

  // 4. Check blocked IPs
  const { data: blockedIpData } = await supabase
    .from('ip_blocklist')
    .select('*')
    .gte('blocked_until', now.toISOString());

  const blockedIps = blockedIpData?.length || 0;
  logger.info(`[${requestId}] Blocked IPs: ${blockedIps}`);

  // 5. Check critical security events (last hour)
  const { data: securityEventsData } = await supabase
    .from('security_logs')
    .select('*')
    .gte('created_at', oneHourAgo.toISOString())
    .in('severity', ['high', 'critical']);

  const criticalEvents = securityEventsData?.length || 0;
  logger.info(`[${requestId}] Critical events: ${criticalEvents}`);

  const metrics: SecurityMetrics = {
    rate_limit_breaches: rateLimitBreaches,
    replay_attempts: replayAttempts,
    failed_logins: failedLoginSpikes,
    blocked_ips: blockedIps,
    critical_events: criticalEvents,
  };

  // Check thresholds and create alerts
  const alerts: string[] = [];

  if (rateLimitBreaches > 5) {
    alerts.push(`High rate limit breaches: ${rateLimitBreaches} in last hour`);
    await createSystemAlert(supabase, 'rate_limit_breach', 'warning',
      `${rateLimitBreaches} rate limit breaches detected in the last hour`);
  }

  if (replayAttempts > 0) {
    alerts.push(`Replay attack attempts detected: ${replayAttempts}`);
    await createSystemAlert(supabase, 'replay_attack', 'critical',
      `${replayAttempts} potential replay attack attempts detected`);
  }

  if (failedLoginSpikes > 0) {
    alerts.push(`Failed login spikes from ${failedLoginSpikes} IPs`);
    await createSystemAlert(supabase, 'failed_login_spike', 'warning',
      `Failed login spikes detected from ${failedLoginSpikes} IP addresses`);
  }

  if (criticalEvents > 10) {
    alerts.push(`High volume of critical security events: ${criticalEvents}`);
    await createSystemAlert(supabase, 'critical_event_spike', 'critical',
      `${criticalEvents} critical security events in the last hour`);
  }

  // 6. Check for silent cron jobs
  try {
    const { data: silentJobs, error: sjError } = await supabase
      .from('v_cron_silence')
      .select('*');

    if (!sjError && silentJobs && silentJobs.length > 0) {
      const criticalSilentJobs = silentJobs.filter((job: Record<string, unknown>) => {
        const silenceMs = parseInterval(job.silence_duration as string);
        const expectedMs = parseInterval(job.expected_interval as string);
        return silenceMs > expectedMs * 2;
      });

      if (criticalSilentJobs.length > 0) {
        const jobNames = criticalSilentJobs.map((j: Record<string, unknown>) => j.job_key).join(', ');
        alerts.push(`Silent cron jobs detected: ${jobNames}`);
        await createSystemAlert(supabase, 'cron_silence', 'critical',
          `${criticalSilentJobs.length} scheduled jobs have stopped executing: ${jobNames}`);
      }
    }
  } catch (cronError) {
    logger.warn(`[${requestId}] Cron silence check failed:`, cronError);
  }

  // Log to security_logs
  await supabase.from('security_logs').insert({
    event_type: 'security_scan',
    severity: alerts.length > 0 ? 'warning' : 'info',
    ip_address: 'system',
    endpoint: '/functions/v1/security-alert-dispatcher',
    details: { metrics, alerts, request_id: requestId },
    blocked: false,
  });

  logger.info(`[${requestId}] Security scan complete. Alerts: ${alerts.length}`);

  // Report success to cron health monitoring
  try {
    await supabase.rpc('update_cron_health', {
      p_cron_name: 'security-alert-dispatcher',
      p_success: true,
      p_error: null,
    });
  } catch (err) { console.warn('[security-alert-dispatcher] cron health update failed', err); }

  return {
    success: true,
    request_id: requestId,
    timestamp: now.toISOString(),
    metrics,
    alerts,
    alerts_created: alerts.length,
  };
});

async function createSystemAlert(
  supabase: SupabaseClient,
  alertType: string,
  severity: 'info' | 'warning' | 'critical',
  message: string,
) {
  try {
    await supabase.from('system_alerts').insert({
      alert_type: alertType,
      severity,
      message,
      resolved: false,
    });
  } catch (error) {
    logger.error('Failed to create system alert:', error);
  }
}

/**
 * Parse PostgreSQL interval string to milliseconds
 * Supports formats like "00:10:00" (HH:MM:SS) or "5 minutes"
 */
function parseInterval(interval: string): number {
  if (!interval) return 0;

  const hhmmss = interval.match(/^(\d+):(\d+):(\d+)/);
  if (hhmmss) {
    const hours = parseInt(hhmmss[1], 10);
    const minutes = parseInt(hhmmss[2], 10);
    const seconds = parseInt(hhmmss[3], 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  const minMatch = interval.match(/(\d+)\s*minute/i);
  if (minMatch) return parseInt(minMatch[1], 10) * 60 * 1000;

  const hourMatch = interval.match(/(\d+)\s*hour/i);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 3600 * 1000;

  return 0;
}
