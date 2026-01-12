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

export interface ConfidenceGapTrend {
  id: string;
  tenant_id: string;
  created_at: string;
  ana_score: number;
  red_score: number;
  confidence_gap: number;
  health_status: string;
  gap_delta: number | null;
  alert_triggered: boolean;
  avg_gap_30d: number | null;
  avg_gap_90d: number | null;
  gap_change: number | null;
  trend_direction: 'improving' | 'stable' | 'degrading' | null;
  consecutive_decrease: boolean;
  consecutive_alerts: number | null;
}

export function useConfidenceGapHistory() {
  const { activeTenant } = useActiveTenant();
  
  return useQuery({
    queryKey: ['confidence-gap-history', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      const { data, error } = await supabase
        .from('audit_confidence_gaps')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as ConfidenceGap[];
    },
    enabled: !!activeTenant?.id,
  });
}

export function useConfidenceGapTrend() {
  const { activeTenant } = useActiveTenant();
  
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
      return data as ConfidenceGapTrend[];
    },
    enabled: !!activeTenant?.id,
  });
}

export function useLatestConfidenceGap() {
  const { activeTenant } = useActiveTenant();
  
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
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as ConfidenceGap | null;
    },
    enabled: !!activeTenant?.id,
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

export function getHealthStatusColor(status: string): string {
  switch (status) {
    case 'healthy': return 'text-green-500';
    case 'attention': return 'text-yellow-500';
    case 'critical': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}

export function getHealthStatusBg(status: string): string {
  switch (status) {
    case 'healthy': return 'bg-green-500/10 border-green-500/20';
    case 'attention': return 'bg-yellow-500/10 border-yellow-500/20';
    case 'critical': return 'bg-red-500/10 border-red-500/20';
    default: return 'bg-muted';
  }
}

export function getHealthStatusLabel(status: string): string {
  switch (status) {
    case 'healthy': return 'Saudável';
    case 'attention': return 'Atenção';
    case 'critical': return 'Crítico';
    default: return status;
  }
}
