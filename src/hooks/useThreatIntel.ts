import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import type { ThreatIntelStats } from '@/domain/entities/ThreatIndicator';

export function useThreatIntelStats() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['threat-intel-stats', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_threat_intel_stats', {
        p_tenant_id: tenant!.id,
      });
      if (error) throw error;
      return data as any as ThreatIntelStats;
    },
    enabled: !!tenant?.id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false, // COST-OPT: 60s → 5min (threat intel feeds sync hourly)
    staleTime: 60_000,
  });
}

export function useThreatIndicators(options?: { limit?: number; source?: string }) {
  const { tenant } = useTenant();
  const limit = options?.limit ?? 50;

  return useQuery({
    queryKey: ['threat-indicators', tenant?.id, options?.source, limit],
    queryFn: async () => {
      let query = supabase
        .from('threat_indicators')
        .select('id, tenant_id, indicator_type, indicator_value, source, severity, confidence_score, is_active, first_seen_at, last_seen_at, tags, created_at')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false })
        .limit(limit);

      if (options?.source) {
        query = query.eq('source', options.source as "abuse_ch_feodotracker" | "abuse_ch_malwarebazaar" | "abuse_ch_urlhaus" | "alienvault_otx" | "cybershield_network" | "internal" | "manual" | "virustotal");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });
}

export function useThreatMatches(options?: { status?: string }) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['threat-matches', tenant?.id, options?.status],
    queryFn: async () => {
      let query = supabase
        .from('threat_matches')
        .select('*, threat_indicators(*)')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });
}

export function useThreatFeedSyncLog() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['threat-feed-sync-log', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('threat_feed_sync_log')
        .select('id, tenant_id, feed_source, status, indicators_fetched, indicators_new, indicators_updated, error_message, sync_started_at, sync_completed_at, created_at')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });
}

export function useSyncThreatFeeds() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-threat-feeds', {
        body: { tenant_id: tenant!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threat-intel-stats'] });
      queryClient.invalidateQueries({ queryKey: ['threat-indicators'] });
      queryClient.invalidateQueries({ queryKey: ['threat-feed-sync-log'] });
    },
  });
}
