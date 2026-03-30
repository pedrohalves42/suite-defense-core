/**
 * Security metric checks for alert dispatcher
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export interface SecurityMetrics {
  rate_limit_breaches: number;
  replay_attempts: number;
  failed_logins: number;
  blocked_ips: number;
  critical_events: number;
}

export async function gatherSecurityMetrics(supabase: SupabaseClient, requestId: string): Promise<SecurityMetrics> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  const { data: rateLimitData } = await supabase.from('rate_limits').select('*').gte('window_start', oneHourAgo.toISOString()).not('blocked_until', 'is', null);
  const rateLimitBreaches = rateLimitData?.length || 0;
  logger.info(`[${requestId}] Rate limit breaches: ${rateLimitBreaches}`);

  const { data: replayData } = await supabase.rpc('get_replay_attempts', { hours_back: 1 });
  const replayAttempts = replayData?.[0]?.attempt_count || 0;
  logger.info(`[${requestId}] Replay attempts: ${replayAttempts}`);

  const { data: failedLoginData } = await supabase.from('failed_login_attempts').select('ip_address, count(*)', { count: 'exact' }).gte('created_at', tenMinutesAgo.toISOString());
  const ipCounts: Record<string, number> = {};
  failedLoginData?.forEach((attempt: Record<string, unknown>) => { ipCounts[attempt.ip_address as string] = (ipCounts[attempt.ip_address as string] || 0) + 1; });
  const failedLoginSpikes = Object.entries(ipCounts).filter(([_, count]) => count >= 5).length;
  logger.info(`[${requestId}] Failed login spikes: ${failedLoginSpikes}`);

  const { data: blockedIpData } = await supabase.from('ip_blocklist').select('*').gte('blocked_until', now.toISOString());
  const blockedIps = blockedIpData?.length || 0;

  const { data: securityEventsData } = await supabase.from('security_logs').select('*').gte('created_at', oneHourAgo.toISOString()).in('severity', ['high', 'critical']);
  const criticalEvents = securityEventsData?.length || 0;

  return { rate_limit_breaches: rateLimitBreaches, replay_attempts: replayAttempts, failed_logins: failedLoginSpikes, blocked_ips: blockedIps, critical_events: criticalEvents };
}

export async function checkCronSilence(supabase: SupabaseClient, requestId: string): Promise<string[]> {
  const silentJobNames: string[] = [];
  try {
    const { data: silentJobs, error } = await supabase.from('v_cron_silence').select('*');
    if (!error && silentJobs && silentJobs.length > 0) {
      const criticalSilentJobs = silentJobs.filter((job: Record<string, unknown>) => {
        const silenceMs = parseInterval(job.silence_duration as string);
        const expectedMs = parseInterval(job.expected_interval as string);
        return silenceMs > expectedMs * 2;
      });
      for (const j of criticalSilentJobs) silentJobNames.push(j.job_key as string);
    }
  } catch (cronError) { logger.warn(`[${requestId}] Cron silence check failed:`, cronError); }
  return silentJobNames;
}

function parseInterval(interval: string): number {
  if (!interval) return 0;
  const hhmmss = interval.match(/^(\d+):(\d+):(\d+)/);
  if (hhmmss) return (parseInt(hhmmss[1]) * 3600 + parseInt(hhmmss[2]) * 60 + parseInt(hhmmss[3])) * 1000;
  const minMatch = interval.match(/(\d+)\s*minute/i);
  if (minMatch) return parseInt(minMatch[1]) * 60 * 1000;
  const hourMatch = interval.match(/(\d+)\s*hour/i);
  if (hourMatch) return parseInt(hourMatch[1]) * 3600 * 1000;
  return 0;
}
