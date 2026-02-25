import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PipelineSignalKey = 'heartbeats' | 'jobs' | 'web_activity' | 'dns_policy';
export type PipelineFreshnessStatus = 'fresh' | 'stale' | 'critical' | 'unknown';

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

function computeStatus(lastSeenAt: string | null, freshMins: number, criticalMins: number) {
  if (!lastSeenAt) {
    return { status: 'unknown' as const, minutesAgo: null as number | null };
  }

  const minutesAgo = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60);
  if (!Number.isFinite(minutesAgo) || minutesAgo < 0) {
    return { status: 'unknown' as const, minutesAgo: null as number | null };
  }
  if (minutesAgo < freshMins) return { status: 'fresh' as const, minutesAgo };
  if (minutesAgo < criticalMins) return { status: 'stale' as const, minutesAgo };
  return { status: 'critical' as const, minutesAgo };
}

function computeOverallStatus(signals: PipelineSignalHealth[]): PipelineFreshnessStatus {
  // Fail-closed: any unknown/critical makes overall not-green.
  if (signals.some(s => s.status === 'critical')) return 'critical';
  if (signals.some(s => s.status === 'unknown')) return 'unknown';
  if (signals.some(s => s.status === 'stale')) return 'stale';
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
  const freshMinutes = opts?.freshMinutes ?? 5;
  const criticalMinutes = opts?.criticalMinutes ?? 30;
  const refetchIntervalMs = opts?.refetchIntervalMs ?? 300000; // COST-OPT: 60s → 5min

  return useQuery({
    queryKey: ['pipeline-health', tenantId, freshMinutes, criticalMinutes],
    enabled: enabled && !!tenantId,
    refetchInterval: refetchIntervalMs,
    staleTime: 30000,
    queryFn: async (): Promise<PipelineHealth> => {
      if (!tenantId) throw new Error('tenantId is required');

      // Note: use lightweight “latest timestamp” queries (limit 1) to keep it fast.
      const [
        heartbeatsRes,
        jobsRes,
        webRes,
        dnsRes,
      ] = await Promise.all([
      // CORREÇÃO: Usar tabela 'agents' diretamente ao invés de 'agents_safe' view
      // para evitar problemas quando JWT não tem claim active_tenant_id
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
      ]);

      if (heartbeatsRes.error) throw heartbeatsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (webRes.error) throw webRes.error;
      if (dnsRes.error) throw dnsRes.error;

      const nowIso = new Date().toISOString();

      const heartbeatLast = (heartbeatsRes.data as any)?.last_heartbeat ?? null;
      const jobLast = (jobsRes.data as any)?.completed_at ?? (jobsRes.data as any)?.created_at ?? null;
      const webLast = (webRes.data as any)?.visited_at ?? null;
      const dnsLast = (dnsRes.data as any)?.updated_at ?? (dnsRes.data as any)?.created_at ?? null;

      const heartbeatStatus = computeStatus(heartbeatLast, freshMinutes, criticalMinutes);
      const jobsStatus = computeStatus(jobLast, freshMinutes, criticalMinutes);
      const webStatus = computeStatus(webLast, freshMinutes, criticalMinutes);
      const dnsStatus = computeStatus(dnsLast, freshMinutes, criticalMinutes);

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
        thresholds_minutes: { fresh: freshMinutes, critical: criticalMinutes },
        signals,
        overall_status,
      };
    },
  });
}
