import { useQuery } from '@tanstack/react-query';
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

export function useHoneypotStats(tenantId?: string) {
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
    refetchInterval: 60_000, // Refresh every minute
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
    refetchInterval: 30_000,
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
        .limit(168); // 7 days * 24 hours
      if (error) throw error;
      return (data as unknown as HoneypotHourlyStat[]) ?? [];
    },
    refetchInterval: 300_000, // Every 5 min
  });
}
