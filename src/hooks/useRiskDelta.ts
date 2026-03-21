/**
 * Hook for Risk Delta Snapshots (Executive Narrative)
 * Fase 2: Narrativa Executiva Contínua
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface RiskDeltaSnapshot {
  id: string;
  tenant_id: string;
  snapshot_date: string;
  risk_score_start: number | null;
  risk_score_end: number | null;
  delta: number | null;
  threats_blocked: number;
  incidents_prevented: number;
  actions_executed: number;
  actions_pending_approval: number;
  estimated_cost_avoided: number | null;
  executive_summary: string | null;
  key_events: Array<{
    type: string;
    severity: string;
    description: string;
    timestamp: string;
  }>;
  created_at: string;
}

export function useTodayRiskDelta() {
  const { tenant } = useTenant();
  const today = new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: ['risk-delta', 'today', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase
        .from('risk_delta_snapshots')
        .select('id, tenant_id, snapshot_date, risk_score_start, risk_score_end, delta, threats_blocked, incidents_prevented, actions_executed, actions_pending_approval, estimated_cost_avoided, executive_summary, key_events, created_at')
        .eq('tenant_id', tenant.id)
        .eq('snapshot_date', today)
        .maybeSingle();

      if (error) throw error;
      return data as RiskDeltaSnapshot | null;
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRiskDeltaHistory(days = 30) {
  const { tenant } = useTenant();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return useQuery({
    queryKey: ['risk-delta', 'history', tenant?.id, days],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('risk_delta_snapshots')
        .select('id, tenant_id, snapshot_date, risk_score_start, risk_score_end, delta, threats_blocked, incidents_prevented, actions_executed, actions_pending_approval, estimated_cost_avoided, executive_summary, key_events, created_at')
        .eq('tenant_id', tenant.id)
        .gte('snapshot_date', startDate.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: false });

      if (error) throw error;
      return (data || []) as RiskDeltaSnapshot[];
    },
    enabled: !!tenant?.id,
  });
}

export function useGenerateExecutiveReport() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date?: string) => {
      const { data, error } = await supabase.functions.invoke('generate-executive-report', {
        body: {
          tenantId: tenant?.id,
          date: date || new Date().toISOString().split('T')[0],
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate report');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-delta'] });
      toast.success('Relatório executivo gerado com sucesso!');
    },
    onError: (error) => {
      logger.error('Failed to generate executive report:', error);
      toast.error('Erro ao gerar relatório executivo');
    },
  });
}

export function getDeltaInfo(delta: number | null): {
  icon: 'up' | 'down' | 'stable';
  label: string;
  color: string;
  description: string;
} {
  if (delta === null || delta === 0) {
    return {
      icon: 'stable',
      label: 'Estável',
      color: 'text-muted-foreground',
      description: 'O nível de risco permaneceu estável',
    };
  }

  if (delta < 0) {
    return {
      icon: 'down',
      label: `${Math.abs(delta)} pontos`,
      color: 'text-[hsl(var(--success))]',
      description: 'O nível de risco diminuiu',
    };
  }

  return {
    icon: 'up',
    label: `+${delta} pontos`,
    color: 'text-destructive',
    description: 'O nível de risco aumentou',
  };
}

export function formatCurrency(value: number | null): string {
  if (value === null) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
