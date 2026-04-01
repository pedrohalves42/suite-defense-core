import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface AIInsight {
  id: string;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  evidence: any;
  suggested_action: string | null;
  created_at: string;
  acknowledged: boolean;
  dismissed_at: string | null;
}

export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-muted text-muted-foreground',
};

export const INSIGHT_TYPE_LABELS: Record<string, string> = {
  anomaly_detection: 'Detecção de Anomalia',
  root_cause: 'Análise de Causa Raiz',
  optimization: 'Otimização',
  security_threat: 'Ameaça de Segurança',
  compliance: 'Conformidade',
  performance: 'Performance',
};

export function useInsightTriageCenter() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedInsights, setSelectedInsights] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const { data: insights, isLoading } = useQuery({
    queryKey: ['ai-insights-triage', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, insight_type, severity, title, description, evidence, suggested_action, created_at, acknowledged, dismissed_at')
        .eq('tenant_id', tenant.id)
        .eq('acknowledged', false)
        .is('dismissed_at', null)
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        suggested_action: d.suggested_action || null,
      })) as AIInsight[];
    },
    enabled: !!tenant?.id,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (insightIds: string[]) => {
      const { error } = await supabase
        .from('ai_insights')
        .update({ acknowledged: true })
        .in('id', insightIds)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: (_, insightIds) => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights-triage'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      queryClient.invalidateQueries({ queryKey: ['critical-insights-count'] });
      toast.success(`${insightIds.length} insight(s) marcado(s) como revisado(s)`);
      setSelectedInsights(new Set());
    },
    onError: (error) => {
      toast.error('Erro ao processar insights: ' + (error as Error).message);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ insightIds, reason }: { insightIds: string[]; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('ai_insights')
        .update({ 
          dismissed_at: new Date().toISOString(),
          dismissed_by: user?.id,
          dismissal_reason: reason 
        })
        .in('id', insightIds)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: (_, { insightIds }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights-triage'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      queryClient.invalidateQueries({ queryKey: ['critical-insights-count'] });
      toast.success(`${insightIds.length} insight(s) dispensado(s)`);
      setSelectedInsights(new Set());
      setDismissDialogOpen(false);
      setDismissReason('');
    },
    onError: (error) => {
      toast.error('Erro ao dispensar insights: ' + (error as Error).message);
    },
  });

  const criticalCount = insights?.filter(i => i.severity === 'critical').length || 0;
  const highCount = insights?.filter(i => i.severity === 'high').length || 0;

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedInsights);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedInsights(newSelected);
  };

  const selectAllCritical = () => {
    setSelectedInsights(new Set(insights?.filter(i => i.severity === 'critical').map(i => i.id) || []));
  };

  const selectAll = () => {
    setSelectedInsights(new Set(insights?.map(i => i.id) || []));
  };

  const clearSelection = () => setSelectedInsights(new Set());

  const acknowledgeSelected = () => {
    if (selectedInsights.size === 0) { toast.warning('Selecione pelo menos um insight'); return; }
    acknowledgeMutation.mutate(Array.from(selectedInsights));
  };

  const openDismissDialog = () => {
    if (selectedInsights.size === 0) { toast.warning('Selecione pelo menos um insight'); return; }
    setDismissDialogOpen(true);
  };

  const confirmDismiss = () => {
    if (!dismissReason.trim()) { toast.warning('Informe o motivo da dispensa'); return; }
    dismissMutation.mutate({ insightIds: Array.from(selectedInsights), reason: dismissReason });
  };

  const filteredInsights = insights?.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
    if (filterType !== 'all' && i.insight_type !== filterType) return false;
    return true;
  });

  const insightTypes = [...new Set(insights?.map(i => i.insight_type) || [])];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ai-insights-triage'] });

  return {
    insights, filteredInsights, isLoading,
    selectedInsights, toggleSelect, selectAllCritical, selectAll, clearSelection,
    filterSeverity, setFilterSeverity, filterType, setFilterType,
    criticalCount, highCount, insightTypes,
    acknowledgeSelected, acknowledgeMutation,
    dismissDialogOpen, setDismissDialogOpen, dismissReason, setDismissReason,
    openDismissDialog, confirmDismiss, dismissMutation,
    refresh, setSelectedInsights,
  };
}
