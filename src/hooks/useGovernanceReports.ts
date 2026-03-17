import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

export interface GovernanceReport {
  id: string;
  tenant_id: string;
  report_type: 'weekly' | 'monthly' | 'quarterly';
  period_start: string;
  period_end: string;
  executive_summary: string;
  key_metrics: Record<string, unknown>;
  risk_debt_summary: Record<string, unknown> | null;
  sla_performance: Record<string, unknown> | null;
  human_decisions: Record<string, unknown> | null;
  generated_by: string;
  generated_at: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface WeeklyMetrics {
  period_start: string;
  period_end: string;
  tasks_opened: number;
  tasks_resolved: number;
  tasks_ignored: number;
  tasks_risk_accepted: number;
  sla_breached: number;
  human_decisions: number;
  avg_resolution_hours: number;
  critical_open: number;
  net_tasks: number;
}

export function useGovernanceReports() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['governance-reports', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('governance_reports')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('period_start', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as GovernanceReport[];
    },
    enabled: !!tenant?.id,
  });
}

export function useWeeklyMetrics(weekStart?: string) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['weekly-metrics', tenant?.id, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('collect_weekly_governance_metrics', {
        tenant_uuid: tenant!.id,
        week_start: weekStart || null,
      });

      if (error) throw error;
      return data as unknown as WeeklyMetrics;
    },
    enabled: !!tenant?.id,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ 
      reportType, 
      periodStart, 
      periodEnd,
      executiveSummary,
      keyMetrics 
    }: { 
      reportType: 'weekly' | 'monthly' | 'quarterly';
      periodStart: string;
      periodEnd: string;
      executiveSummary: string;
      keyMetrics: Json;
    }) => {
      const { data, error } = await supabase
        .from('governance_reports')
        .insert([{
          tenant_id: tenant!.id,
          report_type: reportType,
          period_start: periodStart,
          period_end: periodEnd,
          executive_summary: executiveSummary,
          key_metrics: keyMetrics,
          generated_by: 'ai',
        }])
        .select()
        .single();

      if (error) throw error;
      return data as GovernanceReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['governance-reports'] });
      toast.success('Relatório gerado com sucesso');
    },
    onError: (error) => {
      console.error('Error creating report:', error);
      toast.error('Erro ao gerar relatório');
    },
  });
}

export function useApproveReport() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // V-1081 FIX: Add tenant_id filter
      const { data, error } = await supabase
        .from('governance_reports')
        .update({
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', reportId)
        .eq('tenant_id', tenant!.id)
        .select()
        .single();

      if (error) throw error;
      return data as GovernanceReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['governance-reports'] });
      toast.success('Relatório aprovado');
    },
    onError: (error) => {
      console.error('Error approving report:', error);
      toast.error('Erro ao aprovar relatório');
    },
  });
}
