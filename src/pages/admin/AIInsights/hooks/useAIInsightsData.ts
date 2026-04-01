import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface AIInsight {
  id: string;
  tenant_id: string;
  insight_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence: any;
  recommendation: string;
  confidence_score: number;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  status?: string;
}

export interface Statistics {
  total: number;
  critical: number;
  warning: number;
  info: number;
  acknowledged: number;
  pending: number;
}

export function useAIInsightsData() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [selectedInsightForDismiss, setSelectedInsightForDismiss] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      const { data, error } = await supabase.functions.invoke('ai-router', {
        body: { action: 'get-insights', payload: { page: '1', limit: '50' } }
      });
      if (error) throw error;
      return data as { insights: AIInsight[]; statistics: Statistics };
    },
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('ai_insights')
        .update({
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
          status: 'resolved',
        })
        .eq('id', insightId)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success('Insight marcado como reconhecido');
    },
    onError: (error) => {
      toast.error('Erro ao reconhecer insight: ' + error.message);
    },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async (insightIds: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('ai_insights')
        .update({
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
          status: 'resolved',
        })
        .in('id', insightIds)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success('Todos os insights foram reconhecidos');
    },
    onError: (error) => {
      toast.error('Erro ao reconhecer insights: ' + error.message);
    },
  });

  const executeSolutionMutation = useMutation({
    mutationFn: async ({ actionId, solutionType, parameters }: { actionId: string; solutionType: string; parameters?: any }) => {
      const { data, error } = await supabase.functions.invoke('ai-router', {
        body: { action: 'execute-solution', payload: { action_id: actionId, solution_type: solutionType, parameters } }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success('Solucao aplicada com sucesso', { description: JSON.stringify(data.result) });
    },
    onError: (error: Error) => {
      toast.error('Erro ao executar solucao', { description: error.message });
    },
  });

  const insights = data?.insights || [];
  const stats = data?.statistics || { total: 0, critical: 0, warning: 0, info: 0, acknowledged: 0, pending: 0 };
  const pendingInsights = insights.filter(i => !['resolved', 'rejected'].includes(String(i.status || 'open')));
  const acknowledgedInsights = insights.filter(i => ['resolved', 'rejected'].includes(String(i.status || '')));

  return {
    isLoading, insights, stats, pendingInsights, acknowledgedInsights,
    acknowledgeMutation, acknowledgeAllMutation, executeSolutionMutation,
    dismissDialogOpen, setDismissDialogOpen,
    selectedInsightForDismiss, setSelectedInsightForDismiss,
  };
}

export function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'warning': return 'warning';
    default: return 'secondary';
  }
}

export function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    anomaly_detection: 'Deteccao de Anomalia',
    optimization: 'Otimizacao',
    prediction: 'Predicao',
    root_cause: 'Causa Raiz',
  };
  return labels[type] || type;
}

export function formatInsightDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });
}
