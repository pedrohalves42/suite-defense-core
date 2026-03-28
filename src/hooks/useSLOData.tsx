import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

export interface SLODefinition {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  target_percent: number;
  measurement_window: string;
  category: string;
  is_active: boolean;
}

export interface SLOMeasurement {
  id: string;
  slo_id: string;
  tenant_id: string;
  measured_at: string;
  current_value: number;
  target_value: number;
  error_budget_used: number;
  sample_size: number;
  is_breached: boolean;
}

export interface SLOAlert {
  id: string;
  slo_id: string;
  tenant_id: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export const useSLOData = () => {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  // V-9001 FIX: Add tenantId to queryKey to prevent cross-tenant cache pollution
  const { data: definitions, isLoading: loadingDefinitions } = useQuery({
    queryKey: ['slo-definitions', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slo_definitions')
        .select('id, name, display_name, description, category, target_percent, measurement_window, is_active, created_at')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as SLODefinition[];
    }
  });

  // Fetch latest measurements for tenant
  const { data: measurements, isLoading: loadingMeasurements } = useQuery({
    queryKey: ['slo-measurements', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('slo_measurements')
        .select('id, tenant_id, slo_id, current_value, target_value, is_breached, error_budget_used, sample_size, measured_at')
        .eq('tenant_id', tenant.id)
        .order('measured_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as SLOMeasurement[];
    },
    enabled: !!tenant?.id
  });

  // Fetch active alerts
  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ['slo-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('slo_alerts')
        .select('id, tenant_id, slo_id, measurement_id, message, severity, acknowledged, created_at')
        .eq('tenant_id', tenant.id)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SLOAlert[];
    },
    enabled: !!tenant?.id
  });

  // Calculate current SLO status by combining definitions with latest measurements
  const sloStatus = definitions?.map(def => {
    const latestMeasurement = measurements?.find(m => m.slo_id === def.id);
    const relatedAlerts = alerts?.filter(a => a.slo_id === def.id) || [];

    return {
      definition: def,
      latestMeasurement,
      alerts: relatedAlerts,
      status: latestMeasurement 
        ? latestMeasurement.is_breached 
          ? 'breached' 
          : 'healthy'
        : 'no_data'
    };
  }) || [];

  return {
    definitions,
    measurements,
    alerts,
    sloStatus,
    loading: loadingDefinitions || loadingMeasurements || loadingAlerts
  };
};

// Calculate real-time SLO metrics from actual data
export const useCalculatedSLOs = () => {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['calculated-slos', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      const agents = (agentsRaw as unknown as Array<{ id: string; last_heartbeat: string | null }>) || [];

      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const onlineAgents = agents?.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) > fiveMinutesAgo
      ).length || 0;
      const totalAgents = agents?.length || 0;
      const heartbeatRate = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;

      // Job success rate (last 24h)
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', last24h.toISOString());

      const completedJobs = jobs?.filter(j => j.status === 'completed').length || 0;
      const failedJobs = jobs?.filter(j => j.status === 'failed').length || 0;
      const totalJobs = completedJobs + failedJobs;
      const jobSuccessRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 100;

      // Agent uptime (last 24h)
      const agentUptimeRate = heartbeatRate; // Simplified - same as heartbeat for now

      // Enrollment success rate (last 7d)
      const { data: enrollmentKeys } = await supabase
        .from('enrollment_keys')
        .select('id, current_uses, max_uses')
        .eq('tenant_id', tenant.id)
        .gte('created_at', last7d.toISOString());

      const usedKeys = enrollmentKeys?.filter(k => k.current_uses > 0).length || 0;
      const totalKeys = enrollmentKeys?.length || 0;
      const enrollmentRate = totalKeys > 0 ? (usedKeys / totalKeys) * 100 : 100;

      return {
        heartbeat_success: {
          value: heartbeatRate,
          target: 99.9,
          sample_size: totalAgents,
          is_breached: heartbeatRate < 99.9
        },
        job_success: {
          value: jobSuccessRate,
          target: 99.5,
          sample_size: totalJobs,
          is_breached: jobSuccessRate < 99.5
        },
        agent_uptime: {
          value: agentUptimeRate,
          target: 99.0,
          sample_size: totalAgents,
          is_breached: agentUptimeRate < 99.0
        },
        enrollment_success: {
          value: enrollmentRate,
          target: 95.0,
          sample_size: totalKeys,
          is_breached: enrollmentRate < 95.0
        }
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
