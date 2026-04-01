import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useApproveAiAction, useRejectAiAction, requiresFormalApproval } from '@/hooks/useAiActionApproval';
import { useCheckBlastRadius } from '@/hooks/useBlastRadius';
import { useApprovalMetrics } from '@/components/admin/AIApprovalMetrics';
import { useTenant } from '@/hooks/useTenant';
import { logger } from '@/lib/logger';
import type { AIAction, ActionConfig, AIInsight } from '../types';

export function useAIActionApprovalData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading } = useTenant();
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [reviewedDetails, setReviewedDetails] = useState(false);

  const approveAction = useApproveAiAction();
  const rejectAction = useRejectAiAction();
  const checkBlastRadius = useCheckBlastRadius();
  const { data: approvalMetrics } = useApprovalMetrics();
  const isSuspiciousPattern = approvalMetrics?.isSuspiciousPattern || false;

  const { data: pendingActions, isLoading } = useRealtimeQuery<AIAction[]>({
    queryKey: ['ai-actions-pending', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_actions')
        .select(`*, ai_insights (*), ai_action_executions (*)`)
        .eq('tenant_id', tenant!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AIAction[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 300_000,
    realtimeTable: 'ai_insights',
    realtimeFilter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
  });

  const { data: recentInsights } = useQuery({
    queryKey: ['ai-insights-recent', tenant?.id],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, title, description, severity, recommendation, confidence_score, created_at, acknowledged')
        .eq('tenant_id', tenant!.id)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as AIInsight[];
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  const { data: actionConfigs } = useQuery({
    queryKey: ['ai-action-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_action_configs')
        .select('id, action_type, description, risk_level, requires_approval, is_enabled, max_executions_per_day, circuit_breaker_enabled, current_failures, failure_threshold, failure_window_minutes, circuit_open_until, created_at, updated_at')
        .eq('is_enabled', true);
      if (error) throw error;
      return data as ActionConfig[];
    },
  });

  const getActionConfig = (actionType: string) => actionConfigs?.find(c => c.action_type === actionType);

  const handleApproveClick = async (actionId: string, riskLevel: string | null, action?: AIAction) => {
    if (action?.action_payload?.affected_count) {
      try {
        const blastResult = await checkBlastRadius.mutateAsync({
          actionType: action.action_type,
          affectedCount: action.action_payload.affected_count,
        });
        if (!blastResult.allowed) {
          toast({ title: 'Ação bloqueada pelo Blast Radius', description: blastResult.message, variant: 'destructive' });
          return;
        }
        if (blastResult.requires_approval) {
          setSelectedActionId(actionId);
          setSelectedRiskLevel(riskLevel);
          setApprovalNotes(`⚠️ Blast Radius: ${blastResult.message}`);
          setReviewedDetails(false);
          setApprovalDialogOpen(true);
          return;
        }
      } catch (error) {
        logger.error('Blast radius check failed:', error);
      }
    }

    if (isSuspiciousPattern || requiresFormalApproval(riskLevel)) {
      setSelectedActionId(actionId);
      setSelectedRiskLevel(riskLevel);
      setApprovalNotes('');
      setReviewedDetails(false);
      setApprovalDialogOpen(true);
    } else {
      setExecutingActions(prev => new Set(prev).add(actionId));
      approveAction.mutate(
        { actionId },
        {
          onSettled: () => {
            setExecutingActions(prev => { const next = new Set(prev); next.delete(actionId); return next; });
          },
        }
      );
    }
  };

  const handleConfirmApproval = () => {
    if (!selectedActionId) return;
    setExecutingActions(prev => new Set(prev).add(selectedActionId));
    setApprovalDialogOpen(false);
    approveAction.mutate(
      { actionId: selectedActionId, approvalNotes, forcedReview: isSuspiciousPattern || requiresFormalApproval(selectedRiskLevel) },
      {
        onSettled: () => {
          setExecutingActions(prev => { const next = new Set(prev); next.delete(selectedActionId!); return next; });
          setSelectedActionId(null);
          setApprovalNotes('');
        },
      }
    );
  };

  const handleReject = (actionId: string) => rejectAction.mutate({ actionId });

  const handleAnalyzeNow = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-router', { body: { action: 'system-analyzer' } });
      if (error) throw error;
      toast({ title: 'Análise Concluída', description: `${data.insightsGenerated || 0} insights gerados para ${data.tenantsAnalyzed || 0} tenant(s).` });
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights-recent'] });
    } catch (error) {
      toast({ title: 'Erro na Análise', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    pendingActions, recentInsights, isLoading, isAnalyzing,
    executingActions, approvalDialogOpen, setApprovalDialogOpen,
    selectedActionId, selectedRiskLevel, approvalNotes, setApprovalNotes,
    reviewedDetails, setReviewedDetails, isSuspiciousPattern,
    approveAction, rejectAction, checkBlastRadius,
    getActionConfig, handleApproveClick, handleConfirmApproval, handleReject, handleAnalyzeNow,
  };
}
