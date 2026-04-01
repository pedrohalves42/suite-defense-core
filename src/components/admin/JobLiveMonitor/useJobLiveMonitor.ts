import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  const jobs = useCallback(() => {
    const jobMap = new Map<string, LiveJob>();
    initialJobs.forEach(job => jobMap.set(job.id, job));
    realtimeJobs.forEach(job => jobMap.set(job.id, job));
    return Array.from(jobMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, maxJobs);
  }, [initialJobs, realtimeJobs, maxJobs]);

  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel(`jobs-live-${tenant.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const newJob = payload.new as LiveJob;
        setRealtimeJobs(prev => {
          const filtered = prev.filter(j => j.id !== newJob.id);
          return [newJob, ...filtered].slice(0, maxJobs);
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [tenant?.id, maxJobs]);

  const summary = {
    running: jobs().filter(j => j.status === 'delivered').length,
    pending: jobs().filter(j => j.status === 'queued').length,
    completed: jobs().filter(j => j.status === 'completed').length,
    failed: jobs().filter(j => j.status === 'failed').length,
  };

  return { jobs, summary, refetch };
}
