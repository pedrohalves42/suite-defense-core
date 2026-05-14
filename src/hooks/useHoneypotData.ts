import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface HoneypotStats {
  total_interactions: number;
  unique_ip_hashes: number;
  classifications: Record<string, number>;
  modes: Record<string, number>;
}

interface HoneypotInteraction {
  id: string;
  mode: string;
  method: string | null;
  path: string | null;
  classification: string | null;
  source_ip_prefix: string | null;
  source_ip_hash: string | null;
  status_code: number | null;
  created_at: string;
}

interface HoneypotHourlyStat {
  hour_start: string;
  interaction_count: number;
  malicious_count: number;
  suspicious_count: number;
  benign_count: number;
  recon_count: number;
}

/**
 * Realtime subscription that invalidates honeypot queries on new interactions.
 * Replaces 30s/60s polling with event-driven updates (FinOps: ~0 req overhead).
 */
function useHoneypotRealtime(tenantId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only subscribe if we have a tenant context or we're specifically looking for global data
    const channel = supabase
      .channel(`honeypot-realtime-${tenantId || 'global'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'honeypot_interactions',
          filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['honeypot-interactions-recent'] });
          queryClient.invalidateQueries({ queryKey: ['honeypot-stats', tenantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, tenantId]);
}

export function useHoneypotStats(tenantId?: string) {
  useHoneypotRealtime(tenantId);

  return useQuery({
    queryKey: ['honeypot-stats', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_honeypot_stats', {
        p_tenant_id: tenantId || null,
        p_hours: 24,
      });
      if (error) throw error;
      return (data as unknown as HoneypotStats) ?? {
        total_interactions: 0,
        unique_ip_hashes: 0,
        classifications: {},
        modes: {},
      };
    },
    staleTime: 5 * 60 * 1000, // 5 min — Realtime handles freshness
    refetchInterval: false,
  });
}

export function useHoneypotRecentInteractions(limit = 50) {
  return useQuery({
    queryKey: ['honeypot-interactions-recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('honeypot_interactions')
        .select('id, mode, method, path, classification, source_ip_prefix, source_ip_hash, status_code, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as HoneypotInteraction[]) ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 min — Realtime handles freshness
    refetchInterval: false,
  });
}

export function useHoneypotHourlyStats(days = 7) {
  return useQuery({
    queryKey: ['honeypot-hourly-stats', days],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('honeypot_hourly_stats')
        .select('hour_start, interaction_count, malicious_count, suspicious_count, benign_count, recon_count')
        .gte('hour_start', cutoff)
        .order('hour_start', { ascending: true })
        .limit(168);
      if (error) throw error;
      return (data as unknown as HoneypotHourlyStat[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: false, // Hourly stats don't need frequent refresh
  });
}
