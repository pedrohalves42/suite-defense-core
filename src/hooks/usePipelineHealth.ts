import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PipelineSignalKey = 'heartbeats' | 'jobs' | 'web_activity' | 'dns_policy';
export type PipelineFreshnessStatus = 'fresh' | 'stale' | 'critical' | 'disabled' | 'no_data' | 'unknown';

export interface PipelineSignalHealth {
  key: PipelineSignalKey;
  label: string;
  last_seen_at: string | null;
  status: PipelineFreshnessStatus;
  minutes_ago: number | null;
}

export interface PipelineHealth {
  tenant_id: string;
  fetched_at: string;
  thresholds_minutes: { fresh: number; critical: number };
  signals: Record<PipelineSignalKey, PipelineSignalHealth>;
  overall_status: PipelineFreshnessStatus;
}

// Per-signal thresholds (minutes) — realistic for each data source
const SIGNAL_THRESHOLDS: Record<PipelineSignalKey, { fresh: number; critical: number }> = {
  heartbeats: { fresh: 10, critical: 60 },         // agents heartbeat every ~2-5min
  jobs: { fresh: 240, critical: 720 },              // jobs may run infrequently — 4h fresh, 12h critical
  web_activity: { fresh: 480, critical: 1440 },     // web activity depends on business hours — 8h fresh, 24h critical
  dns_policy: { fresh: 43200, critical: 129600 },   // DNS policies are static config — 30 days fresh, 90 days critical
};

function computeStatus(
  lastSeenAt: string | null,
  freshMins: number,
  criticalMins: number,
  hasAnyAgents: boolean,
): { status: PipelineFreshnessStatus; minutesAgo: number | null } {
  if (!lastSeenAt) {
    // No data at all — if no agents exist it's expected, not critical
    return { status: hasAnyAgents ? 'no_data' : 'no_data', minutesAgo: null };
  }

  const minutesAgo = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60);
  if (!Number.isFinite(minutesAgo) || minutesAgo < 0) {
    return { status: 'unknown', minutesAgo: null };
  }
  if (minutesAgo < freshMins) return { status: 'fresh', minutesAgo };
  if (minutesAgo < criticalMins) return { status: 'stale', minutesAgo };
  return { status: 'critical', minutesAgo };
}

function computeOverallStatus(signals: PipelineSignalHealth[]): PipelineFreshnessStatus {
  // Only consider signals that are NOT disabled/no_data for overall status
  const active = signals.filter(s => s.status !== 'disabled' && s.status !== 'no_data');
  if (active.length === 0) return 'no_data';
  if (active.some(s => s.status === 'critical')) return 'critical';
  if (active.some(s => s.status === 'unknown')) return 'unknown';
  if (active.some(s => s.status === 'stale')) return 'stale';
  return 'fresh';
}

export function usePipelineHealth(
  tenantId: string | undefined,
  opts?: {
    enabled?: boolean;
    freshMinutes?: number;
    criticalMinutes?: number;
    refetchIntervalMs?: number;
  }
) {
  const enabled = opts?.enabled ?? true;
  const adaptiveInterval = useAdaptivePolling(opts?.refetchIntervalMs ?? 300000);

  return useQuery({
    queryKey: ['pipeline-health', tenantId],
    enabled: enabled && !!tenantId,
    refetchInterval: adaptiveInterval,
    staleTime: 30000,
    queryFn: async (): Promise<PipelineHealth> => {
      if (!tenantId) throw new Error('tenantId is required');

      const [
        heartbeatsRes,
        jobsRes,
        webRes,
        dnsRes,
        settingsRes,
        agentCountRes,
      ] = await Promise.all([
        supabase
          .from('agents')
          .select('last_heartbeat')
          .eq('tenant_id', tenantId)
          .is('archived_at', null)
          .order('last_heartbeat', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('jobs')
          .select('created_at, completed_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('agent_web_activity')
          .select('visited_at')
          .eq('tenant_id', tenantId)
          .order('visited_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('blocked_websites')
          .select('updated_at, created_at')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Fetch tenant settings to know if DNS is enabled
        supabase
          .from('tenant_settings')
          .select('dns_local_filter_enabled')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        // Check if tenant has any agents at all
        supabase
          .from('agents')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .is('archived_at', null),
      ]);

      if (heartbeatsRes.error) throw heartbeatsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (webRes.error) throw webRes.error;
      if (dnsRes.error) throw dnsRes.error;
      // Settings/count errors are non-fatal
      
      const dnsEnabled = settingsRes.data?.dns_local_filter_enabled ?? false;
      const hasAgents = (agentCountRes.count ?? 0) > 0;

      const nowIso = new Date().toISOString();

      const heartbeatLast = heartbeatsRes.data?.last_heartbeat ?? null;
      const jobLast = jobsRes.data?.completed_at ?? jobsRes.data?.created_at ?? null;
      const webLast = webRes.data?.visited_at ?? null;
      const dnsLast = dnsRes.data?.updated_at ?? dnsRes.data?.created_at ?? null;

      const hbT = SIGNAL_THRESHOLDS.heartbeats;
      const jobT = SIGNAL_THRESHOLDS.jobs;
      const webT = SIGNAL_THRESHOLDS.web_activity;
      const dnsT = SIGNAL_THRESHOLDS.dns_policy;

      const heartbeatStatus = computeStatus(heartbeatLast, hbT.fresh, hbT.critical, hasAgents);
      const jobsStatus = computeStatus(jobLast, jobT.fresh, jobT.critical, hasAgents);
      const webStatus = computeStatus(webLast, webT.fresh, webT.critical, hasAgents);
      
      // DNS: if feature disabled, show "disabled" instead of critical
      const dnsStatus = !dnsEnabled
        ? { status: 'disabled' as const, minutesAgo: null as number | null }
        : computeStatus(dnsLast, dnsT.fresh, dnsT.critical, hasAgents);

      const signals: PipelineHealth['signals'] = {
        heartbeats: {
          key: 'heartbeats',
          label: 'Heartbeats',
          last_seen_at: heartbeatLast,
          status: heartbeatStatus.status,
          minutes_ago: heartbeatStatus.minutesAgo,
        },
        jobs: {
          key: 'jobs',
          label: 'Jobs',
          last_seen_at: jobLast,
          status: jobsStatus.status,
          minutes_ago: jobsStatus.minutesAgo,
        },
        web_activity: {
          key: 'web_activity',
          label: 'Web Activity',
          last_seen_at: webLast,
          status: webStatus.status,
          minutes_ago: webStatus.minutesAgo,
        },
        dns_policy: {
          key: 'dns_policy',
          label: 'DNS Policy',
          last_seen_at: dnsLast,
          status: dnsStatus.status,
          minutes_ago: dnsStatus.minutesAgo,
        },
      };

      const overall_status = computeOverallStatus(Object.values(signals));

      return {
        tenant_id: tenantId,
        fetched_at: nowIso,
        thresholds_minutes: { fresh: 5, critical: 30 },
        signals,
        overall_status,
      };
    },
  });
}
