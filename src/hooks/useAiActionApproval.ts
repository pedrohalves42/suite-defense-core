/**
 * Hook para Aprovação Formal de AI Actions
 * PASSO 1: Aprovação Humana REAL para AI Actions (+20 pts score)
 * 
 * Este hook implementa o fluxo de aprovação formal:
 * - Ações com risk_level 'high' ou 'critical' requerem aprovação formal
 * - Preenche approved_at e approved_by antes da execução
 * - Cria decision_event para rastreabilidade
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from './useTenant';
import type { Json } from '@/integrations/supabase/types';

export interface AiActionApprovalParams {
  actionId: string;
  approvalNotes?: string;
  forcedReview?: boolean;
}

export function useApproveAiAction() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ actionId, approvalNotes, forcedReview }: AiActionApprovalParams) => {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // 2. Get the action details - V-1022 FIX: Add tenant_id filter
      if (!tenant?.id) throw new Error('Tenant not selected');
      const { data: action, error: actionError } = await supabase
        .from('ai_actions')
        .select('*, ai_insights(*)')
        .eq('id', actionId)
        .eq('tenant_id', tenant.id)
        .single();

      if (actionError || !action) throw new Error('Action not found');

      // 3. Set approval fields (this is the FORMAL approval)
      const now = new Date().toISOString();
      // V-1080 FIX: Add tenant_id filter
      const { error: approvalError } = await supabase
        .from('ai_actions')
        .update({
          approved_at: now,
          approved_by: user.id,
          human_reviewed: true,
          reviewed_at: now,
        })
        .eq('id', actionId)
        .eq('tenant_id', tenant!.id);

      if (approvalError) throw approvalError;

      // 4. Create decision_event for audit trail
      const evidence: Json = {
        action_id: actionId,
        action_type: action.action_type,
        risk_level: action.risk_level,
        insight_id: action.insight_id,
        approval_notes: approvalNotes || null,
        forced_review: forcedReview || false, // AJUSTE 1: Registrar se foi revisão forçada
        approved_at: now,
        approved_by: user.id,
        user_email: user.email,
      };

      // V-1022 FIX: Always use validated tenant.id, never fallback to action.tenant_id
      await supabase.from('decision_events').insert({
        tenant_id: tenant.id,
        rule_code: 'AI_ACTION_APPROVAL',
        action: 'approve_ai_action',
        evidence,
        decision_source: 'human',
        decision_type: 'approval',
      });

      // 5. Now execute the action via edge function
      const { data: execResult, error: execError } = await supabase.functions.invoke('ai-action-executor', {
        body: { action_id: actionId },
      });

      if (execError) throw execError;
      if (execResult?.error) throw new Error(execResult.error);

      return { success: true, actionId, executionResult: execResult };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      toast.success('Ação aprovada e executada com sucesso');
    },
    onError: (error) => {
      console.error('[useApproveAiAction] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao aprovar ação');
    },
  });
}

export function useRejectAiAction() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ actionId, rejectionReason }: { actionId: string; rejectionReason?: string }) => {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // 2. Get the action details - V-1022 FIX: Add tenant_id filter
      if (!tenant?.id) throw new Error('Tenant not selected');
      const { data: action, error: actionError } = await supabase
        .from('ai_actions')
        .select('*')
        .eq('id', actionId)
        .eq('tenant_id', tenant.id)
        .single();

      if (actionError || !action) throw new Error('Action not found');

      // 3. Update status to rejected
      // V-1080 FIX: Add tenant_id filter
      const { error: rejectError } = await supabase
        .from('ai_actions')
        .update({ status: 'rejected' })
        .eq('id', actionId)
        .eq('tenant_id', tenant!.id);

      if (rejectError) throw rejectError;

      // 4. Create decision_event for audit trail
      const evidence: Json = {
        action_id: actionId,
        action_type: action.action_type,
        risk_level: action.risk_level,
        rejection_reason: rejectionReason || null,
        rejected_by: user.id,
        user_email: user.email,
      };

      // V-1022 FIX: Always use validated tenant.id
      await supabase.from('decision_events').insert({
        tenant_id: tenant.id,
        rule_code: 'AI_ACTION_REJECTION',
        action: 'reject_ai_action',
        evidence,
        decision_source: 'human',
        decision_type: 'rejection',
      });

      return { success: true, actionId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      toast.success('Ação rejeitada');
    },
    onError: (error) => {
      console.error('[useRejectAiAction] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao rejeitar ação');
    },
  });
}

/**
 * Hook para verificar se uma ação requer aprovação formal
 */
export function requiresFormalApproval(riskLevel: string | null): boolean {
  return riskLevel === 'high' || riskLevel === 'critical';
}

/**
 * Labels para níveis de risco
 */
export const RISK_LEVEL_LABELS: Record<string, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  critical: 'Crítico',
};

/**
 * Cores para níveis de risco
 */
export const RISK_LEVEL_COLORS: Record<string, string> = {
  low: 'text-green-500 bg-green-500/10',
  medium: 'text-amber-500 bg-amber-500/10',
  high: 'text-orange-500 bg-orange-500/10',
  critical: 'text-red-500 bg-red-500/10',
};
