/**
 * EDR Telemetry Hooks — Sprint 23
 * React Query hooks for endpoint telemetry data.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import type {
  EndpointProcessEvent,
  EndpointFileEvent,
  EndpointNetworkEvent,
  EndpointRegistryEvent,
  EndpointDetectionEvent,
  TelemetryStats,
} from '@/types/edr-telemetry';

// ── Detection Events ──

export function useDetectionEvents(options?: { agentId?: string; status?: string; limit?: number }) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = options?.limit ?? 100;

  return useQuery({
    queryKey: ['edr-detections', activeTenant?.id, options?.agentId, options?.status, limit],
    queryFn: async () => {
      let query = supabase
        .from('endpoint_detection_events')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (options?.agentId) query = query.eq('agent_id', options.agentId);
      if (options?.status) query = query.eq('status', options.status);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as EndpointDetectionEvent[];
    },
    enabled: !loading && !!activeTenant?.id,
    refetchInterval: 30_000,
  });
}

// ── Process Events ──

export function useProcessEvents(agentId: string, options?: { limit?: number; suspiciousOnly?: boolean }) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = options?.limit ?? 200;

  return useQuery({
    queryKey: ['edr-process-events', activeTenant?.id, agentId, options?.suspiciousOnly, limit],
    queryFn: async () => {
      let query = supabase
        .from('endpoint_process_events')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .eq('agent_id', agentId)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (options?.suspiciousOnly) query = query.eq('is_suspicious', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as EndpointProcessEvent[];
    },
    enabled: !loading && !!activeTenant?.id && !!agentId,
  });
}

// ── File Events ──

export function useFileEvents(agentId: string, options?: { limit?: number; suspiciousOnly?: boolean }) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = options?.limit ?? 200;

  return useQuery({
    queryKey: ['edr-file-events', activeTenant?.id, agentId, options?.suspiciousOnly, limit],
    queryFn: async () => {
      let query = supabase
        .from('endpoint_file_events')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .eq('agent_id', agentId)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (options?.suspiciousOnly) query = query.eq('is_suspicious', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as EndpointFileEvent[];
    },
    enabled: !loading && !!activeTenant?.id && !!agentId,
  });
}

// ── Network Events ──

export function useNetworkEvents(agentId: string, options?: { limit?: number; suspiciousOnly?: boolean }) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = options?.limit ?? 200;

  return useQuery({
    queryKey: ['edr-network-events', activeTenant?.id, agentId, options?.suspiciousOnly, limit],
    queryFn: async () => {
      let query = supabase
        .from('endpoint_network_events')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .eq('agent_id', agentId)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (options?.suspiciousOnly) query = query.eq('is_suspicious', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as EndpointNetworkEvent[];
    },
    enabled: !loading && !!activeTenant?.id && !!agentId,
  });
}

// ── Registry Events ──

export function useRegistryEvents(agentId: string, options?: { limit?: number; suspiciousOnly?: boolean }) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = options?.limit ?? 200;

  return useQuery({
    queryKey: ['edr-registry-events', activeTenant?.id, agentId, options?.suspiciousOnly, limit],
    queryFn: async () => {
      let query = supabase
        .from('endpoint_registry_events')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .eq('agent_id', agentId)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (options?.suspiciousOnly) query = query.eq('is_suspicious', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as EndpointRegistryEvent[];
    },
    enabled: !loading && !!activeTenant?.id && !!agentId,
  });
}

// ── Telemetry Stats ──

export function useTelemetryStats() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['edr-telemetry-stats', activeTenant?.id],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const tenantId = activeTenant!.id;

      const [proc, file, net, reg, dets, critical, mitre] = await Promise.all([
        supabase.from('endpoint_process_events').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('event_time', since),
        supabase.from('endpoint_file_events').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('event_time', since),
        supabase.from('endpoint_network_events').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('event_time', since),
        supabase.from('endpoint_registry_events').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('event_time', since),
        supabase.from('endpoint_detection_events').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('event_time', since),
        supabase.from('endpoint_detection_events').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).in('severity', ['high', 'critical']).eq('status', 'open'),
        supabase.from('endpoint_detection_events').select('mitre_technique_id')
          .eq('tenant_id', tenantId).not('mitre_technique_id', 'is', null)
          .gte('event_time', since),
      ]);

      const uniqueTechniques = new Set((mitre.data || []).map((r: any) => r.mitre_technique_id));

      return {
        processEvents24h: proc.count || 0,
        fileEvents24h: file.count || 0,
        networkEvents24h: net.count || 0,
        registryEvents24h: reg.count || 0,
        detections24h: dets.count || 0,
        criticalDetections: critical.count || 0,
        mitretechniques: uniqueTechniques.size,
      } as TelemetryStats;
    },
    enabled: !loading && !!activeTenant?.id,
    refetchInterval: 60_000,
  });
}

// ── MITRE ATT&CK Coverage ──

export function useMitreAttackCoverage() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['edr-mitre-coverage', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('endpoint_detection_events')
        .select('mitre_technique_id, mitre_tactic, mitre_technique_name, severity, event_time')
        .eq('tenant_id', activeTenant!.id)
        .not('mitre_technique_id', 'is', null)
        .order('event_time', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Group by technique
      const techniqueMap = new Map<string, {
        techniqueId: string;
        tactic: string;
        name: string;
        count: number;
        lastSeen: string;
        maxSeverity: string;
      }>();

      for (const row of (data || [])) {
        const existing = techniqueMap.get(row.mitre_technique_id);
        if (existing) {
          existing.count++;
          if (row.event_time > existing.lastSeen) existing.lastSeen = row.event_time;
        } else {
          techniqueMap.set(row.mitre_technique_id, {
            techniqueId: row.mitre_technique_id,
            tactic: row.mitre_tactic || 'Unknown',
            name: row.mitre_technique_name || row.mitre_technique_id,
            count: 1,
            lastSeen: row.event_time,
            maxSeverity: row.severity,
          });
        }
      }

      return Array.from(techniqueMap.values()).sort((a, b) => b.count - a.count);
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 5 * 60_000,
  });
}
