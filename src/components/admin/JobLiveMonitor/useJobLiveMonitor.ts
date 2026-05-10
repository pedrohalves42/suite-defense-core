import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { realtimeChannelManager } from '@/lib/realtime-manager';

export interface LiveJob {
  id: string;
  type: string;
  status: string;
  agent_name: string;
  created_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  failure_class: string | null;
}

export function useJobLiveMonitor(maxJobs: number) {
  const { tenant } = useTenant();
  const [realtimeJobs, setRealtimeJobs] = useState<LiveJob[]>([]);
  // V-FIX: Manager handles subscriptions centrally

  const { data: initialJobs = [], refetch } = useQuery({
    queryKey: ['live-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, type, status, agent_name, created_at, delivered_at, completed_at, error_message, failure_class')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(maxJobs);
      if (error) throw error;
      return (data || []) as LiveJob[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
  });

  // PERF: Memoização O(n) com Map para deduplicação em tempo constante.
  // Antes: a função era recriada por render e percorrida múltiplas vezes em `summary`.
  const jobs = useMemo(() => {
    const jobMap = new Map<string, LiveJob>();
    for (const job of initialJobs) jobMap.set(job.id, job);
    for (const job of realtimeJobs) jobMap.set(job.id, job);
    return Array.from(jobMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, maxJobs);
  }, [initialJobs, realtimeJobs, maxJobs]);

  useEffect(() => {
    if (!tenant?.id) return;
    
    const instanceId = `job-live-monitor-${tenant.id}`;
    
    realtimeChannelManager.subscribe(
      instanceId,
      'jobs',
      `tenant_id=eq.${tenant.id}`,
      (payload) => {
        const newJob = payload.new as LiveJob;
        setRealtimeJobs(prev => {
          const filtered = prev.filter(j => j.id !== newJob.id);
          return [newJob, ...filtered].slice(0, maxJobs);
        });
      }
    );

    return () => {
      realtimeChannelManager.unsubscribe(instanceId, 'jobs', `tenant_id=eq.${tenant.id}`);
    };
  }, [tenant?.id, maxJobs]);

  // PERF: single-pass O(n) ao invés de 4× filter() chamados a cada render.
  const summary = useMemo(() => {
    const acc = { running: 0, pending: 0, completed: 0, failed: 0 };
    for (const j of jobs) {
      if (j.status === 'delivered') acc.running++;
      else if (j.status === 'queued') acc.pending++;
      else if (j.status === 'completed') acc.completed++;
      else if (j.status === 'failed') acc.failed++;
    }
    return acc;
  }, [jobs]);

  return { jobs, summary, refetch };
}
