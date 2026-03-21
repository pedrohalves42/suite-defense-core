/**
 * Hook para Dismissal de AI Insights
 * Evidência de discordância humana com a IA (AJUSTE 3)
 * 
 * Permite que usuários dispensem insights que consideram irrelevantes,
 * criando evidência para auditoria de que o sistema pode discordar da IA.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from './useTenant';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

export interface DismissInsightParams {
  insightId: string;
  dismissalReason: string;
}

export function useDismissInsight() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ insightId, dismissalReason }: DismissInsightParams) => {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // 2. Get the insight details - V-1022 FIX: Add tenant_id filter
      if (!tenant?.id) throw new Error('Tenant not selected');
      const { data: insight, error: insightError } = await supabase
        .from('ai_insights')
        .select('id, tenant_id, category, description, severity, status, dismissed_at, insight_type, title')
        .eq('id', insightId)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (insightError || !insight) throw new Error('Insight not found');

      // 3. Update insight with dismissal fields
      const now = new Date().toISOString();
      // V-1085 FIX: Add tenant_id filter
      const { error: updateError } = await supabase
        .from('ai_insights')
        .update({
          dismissed_at: now,
          dismissed_by: user.id,
          dismissal_reason: dismissalReason,
        })
        .eq('id', insightId)
        .eq('tenant_id', tenant!.id);

      if (updateError) throw updateError;

      // 4. Create decision_event for audit trail
      const evidence: Json = {
        insight_id: insightId,
        insight_type: insight.insight_type,
        severity: insight.severity,
        title: insight.title,
        dismissal_reason: dismissalReason,
        dismissed_at: now,
        dismissed_by: user.id,
        user_email: user.email,
      };

      // V-1022 FIX: Always use validated tenant.id
      await supabase.from('decision_events').insert({
        tenant_id: tenant.id,
        rule_code: 'AI_INSIGHT_DISMISSAL',
        action: 'dismiss_ai_insight',
        evidence,
        decision_source: 'human',
        decision_type: 'dismissal',
      });

      return { success: true, insightId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      queryClient.invalidateQueries({ queryKey: ['ai-approval-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      toast.success('Insight dispensado com sucesso');
    },
    onError: (error) => {
      logger.error('[useDismissInsight] Error:', error instanceof Error ? error : undefined);
      toast.error(error instanceof Error ? error.message : 'Erro ao dispensar insight');
    },
  });
}

/**
 * Hook para buscar estatísticas de dismissal
 */
export function useDismissalStats() {
  const { tenant } = useTenant();

  return useQueryClient().fetchQuery({
    queryKey: ['dismissal-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { dismissed: 0, total: 0 };

      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, dismissed_at')
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      const dismissed = data?.filter(i => i.dismissed_at !== null).length || 0;
      const total = data?.length || 0;

      return { dismissed, total };
    },
  });
}
