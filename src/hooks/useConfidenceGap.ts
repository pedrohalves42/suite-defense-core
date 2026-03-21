import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActiveTenant } from './useActiveTenant';

export interface ConfidenceGap {
  id: string;
  tenant_id: string;
  audit_id: string | null;
  red_team_id: string | null;
  ana_score: number;
  red_score: number;
  confidence_gap: number;
  health_status: 'healthy' | 'attention' | 'critical';
  previous_gap: number | null;
  gap_delta: number | null;
  alert_triggered: boolean;
  alert_reason: string | null;
  dimension_gaps: Record<string, number>;
  created_at: string;
}

// Interface aligned with v_confidence_gap_trend view (ADR-026)
export interface ConfidenceGapTrend {
  id: string;
  tenant_id: string;
  audit_id: string | null;
  red_team_id: string | null;
  ana_score: number;
  red_score: number;
  confidence_gap: number;
  health_status: string;
  previous_gap: number | null;
  gap_delta: number | null;
  alert_triggered: boolean;
  alert_reason: string | null;
  dimension_gaps: Record<string, unknown>;
  created_at: string;
  prev_gap: number | null;
  avg_gap_30d: number | null;
  avg_gap_90d: number | null;
  is_improving: boolean;
}

export function useConfidenceGapHistory() {
  const { activeTenant, loading } = useActiveTenant(); // ADR-030 CRIT-01
  
  return useQuery({
    queryKey: ['confidence-gap-history', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      const { data, error } = await supabase
        .from('audit_confidence_gaps')
        .select('id, tenant_id, audit_id, red_team_id, ana_score, red_score, confidence_gap, health_status, previous_gap, gap_delta, alert_triggered, alert_reason, created_at')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as ConfidenceGap[];
    },
    enabled: !loading && !!activeTenant?.id, // ADR-030 CRIT-01
  });
}

export function useConfidenceGapTrend() {
  const { activeTenant, loading } = useActiveTenant(); // ADR-030 CRIT-01
  
  return useQuery({
    queryKey: ['confidence-gap-trend', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      const { data, error } = await supabase
        .from('v_confidence_gap_trend')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      // Map database columns to interface
      return (data || []).map(row => ({
        id: row.id,
        tenant_id: row.tenant_id,
        audit_id: row.audit_id,
        red_team_id: row.red_team_id,
        ana_score: row.ana_score,
        red_score: row.red_score,
        confidence_gap: row.confidence_gap,
        health_status: row.health_status,
        previous_gap: row.previous_gap,
        gap_delta: row.gap_delta,
        alert_triggered: row.alert_triggered,
        alert_reason: row.alert_reason,
        dimension_gaps: row.dimension_gaps as Record<string, unknown>,
        created_at: row.created_at,
        prev_gap: row.prev_gap,
        avg_gap_30d: row.avg_gap_30d,
        avg_gap_90d: row.avg_gap_90d,
        is_improving: row.is_improving,
      })) as ConfidenceGapTrend[];
    },
    enabled: !loading && !!activeTenant?.id, // ADR-030 CRIT-01
  });
}

export function useLatestConfidenceGap() {
  const { activeTenant, loading } = useActiveTenant(); // ADR-030 CRIT-01
  
  return useQuery({
    queryKey: ['confidence-gap-latest', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return null;
      
      const { data, error } = await supabase
        .from('audit_confidence_gaps')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ConfidenceGap | null;
    },
    enabled: !loading && !!activeTenant?.id, // ADR-030 CRIT-01
  });
}

export function useCalculateConfidenceGap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tenantId,
      auditId,
      redTeamId,
      anaScore,
      redScore,
      dimensionGaps = {},
    }: {
      tenantId: string;
      auditId: string;
      redTeamId: string;
      anaScore: number;
      redScore: number;
      dimensionGaps?: Record<string, number>;
    }) => {
      const { data, error } = await supabase.rpc('calculate_confidence_gap', {
        p_tenant_id: tenantId,
        p_audit_id: auditId,
        p_red_team_id: redTeamId,
        p_ana_score: anaScore,
        p_red_score: redScore,
        p_dimension_gaps: dimensionGaps,
      });

      if (error) throw error;
      return data as ConfidenceGap;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['confidence-gap-history'] });
      queryClient.invalidateQueries({ queryKey: ['confidence-gap-latest'] });
      queryClient.invalidateQueries({ queryKey: ['confidence-gap-trend'] });
      
      if (data.alert_triggered) {
        toast.warning(`Alerta: ${data.alert_reason}`);
      }
    },
    onError: (error) => {
      toast.error(`Erro ao calcular gap: ${error.message}`);
    },
  });
}

export { getHealthStatusTextColor as getHealthStatusColor, getHealthStatusBgColor as getHealthStatusBg } from '@/lib/severityColors';

export function getHealthStatusLabel(status: string): string {
  switch (status) {
    case 'healthy': return 'Saudável';
    case 'attention': return 'Atenção';
    case 'critical': return 'Crítico';
    default: return status;
  }
}
