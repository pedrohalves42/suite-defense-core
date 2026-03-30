import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';


export interface RiskBreakdown {
  antivirus_issues?: number;
  critical_vulnerabilities?: number;
  offline_agents?: number;
  critical_events?: number;
  job_failure_rate?: number;
}

export interface RiskScore {
  id: string;
  score: number;
  previous_score: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  breakdown: RiskBreakdown;
  calculated_at: string;
  calculation_version: string;
}

export interface RiskScoreHistory {
  score: number;
  calculated_at: string;
}

export const useRiskScore = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const refetchInterval = useAdaptivePolling(300_000);

  // Fetch latest risk score
  const { data: riskScore, isLoading, error } = useQuery<RiskScore | null>({
    queryKey: ['risk-score', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase
        .from('tenant_risk_scores')
        .select('id, score, previous_score, trend, breakdown, calculated_at, calculation_version')
        .eq('tenant_id', tenant.id)
        .eq('scope', 'tenant')
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as RiskScore | null;
    },
    enabled: !!tenant?.id,
    staleTime: 60000,
    refetchInterval,
  });

  // Fetch risk score history (last 30 days)
  const { data: history } = useQuery<RiskScoreHistory[]>({
    queryKey: ['risk-score-history', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('tenant_risk_scores')
        .select('score, calculated_at')
        .eq('tenant_id', tenant.id)
        .eq('scope', 'tenant')
        .gte('calculated_at', thirtyDaysAgo)
        .order('calculated_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Recalculate risk score mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');

      const { data, error } = await supabase.functions.invoke('calculate-risk-score', {
        body: { tenant_id: tenant.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Risk Score recalculado');
      queryClient.invalidateQueries({ queryKey: ['risk-score', tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['risk-score-history', tenant?.id] });
    },
    onError: (error) => {
      logger.error('Error recalculating risk score:', error);
      toast.error('Erro ao recalcular Risk Score');
    },
  });

  // Helper to get score color (high score = good = green)
  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  // Helper to get score status (high score = secure)
  const getScoreStatus = (score: number): { label: string; variant: 'success' | 'warning' | 'danger' } => {
    if (score >= 90) return { label: 'Excelente', variant: 'success' };
    if (score >= 70) return { label: 'Bom', variant: 'success' };
    if (score >= 50) return { label: 'Adequado', variant: 'warning' };
    if (score >= 30) return { label: 'Atenção', variant: 'warning' };
    return { label: 'Crítico', variant: 'danger' };
  };

  // Helper to get trend icon and label
  const getTrendInfo = (trend: 'up' | 'down' | 'stable' | null): { icon: string; label: string; color: string } => {
    switch (trend) {
      case 'up':
        return { icon: '↑', label: 'Melhorou', color: 'text-success' };
      case 'down':
        return { icon: '↓', label: 'Piorou', color: 'text-destructive' };
      default:
        return { icon: '→', label: 'Estável', color: 'text-muted-foreground' };
    }
  };

  return {
    riskScore,
    history,
    isLoading,
    error,
    recalculate: recalculateMutation.mutate,
    isRecalculating: recalculateMutation.isPending,
    getScoreColor,
    getScoreStatus,
    getTrendInfo,
  };
};
