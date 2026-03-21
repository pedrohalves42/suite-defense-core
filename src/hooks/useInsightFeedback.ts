import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export type FeedbackType = 'useful' | 'noise' | 'false_positive';

export interface InsightFeedback {
  id: string;
  tenant_id: string;
  insight_id: string;
  user_id: string;
  feedback_type: FeedbackType;
  comment: string | null;
  created_at: string;
}

export function useInsightFeedback(insightId?: string) {
  const { activeTenant, loading } = useActiveTenant();
  const queryClient = useQueryClient();

  // Fetch existing feedback for a specific insight
  const { data: feedback, isLoading } = useQuery({
    queryKey: ['insight-feedback', insightId],
    queryFn: async () => {
      if (!insightId) return null;
      
      const { data, error } = await supabase
        .from('ai_insight_feedback')
        .select('id, insight_id, tenant_id, feedback_type, comment, created_by, created_at')
        .eq('insight_id', insightId)
        .maybeSingle();
      
      if (error) throw error;
      return data as InsightFeedback | null;
    },
    enabled: !loading && !!insightId,
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ insightId, feedbackType, comment }: { 
      insightId: string; 
      feedbackType: FeedbackType;
      comment?: string;
    }) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('ai_insight_feedback')
        .upsert({
          tenant_id: activeTenant.id,
          insight_id: insightId,
          user_id: user.user.id,
          feedback_type: feedbackType,
          comment: comment || null,
        }, {
          onConflict: 'insight_id,user_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['insight-feedback', variables.insightId] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
      
      const messages: Record<FeedbackType, string> = {
        useful: 'Obrigado! Marcado como útil.',
        noise: 'Entendido. Marcado como ruído.',
        false_positive: 'Registrado como falso positivo.',
      };
      toast.success(messages[variables.feedbackType]);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar feedback: ${error.message}`);
    },
  });

  return {
    feedback,
    isLoading,
    hasFeedback: !!feedback,
    submitFeedback,
  };
}

// Hook for feedback statistics (admin dashboard)
export function useFeedbackStats() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['feedback-stats', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return null;
      
      const { data, error } = await supabase
        .from('ai_insight_feedback')
        .select('feedback_type, insight_id')
        .eq('tenant_id', activeTenant.id);
      
      if (error) throw error;
      
      const stats = {
        total: data.length,
        useful: data.filter(f => f.feedback_type === 'useful').length,
        noise: data.filter(f => f.feedback_type === 'noise').length,
        false_positive: data.filter(f => f.feedback_type === 'false_positive').length,
      };
      
      return stats;
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 60000,
  });
}

/**
 * Hook para buscar métricas de qualidade agregadas por tipo de insight
 * Usa a view insight_feedback_quality
 */
export function useFeedbackQualityMetrics() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['feedback-quality-metrics', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      // Query the aggregated view — uses manual type since view is not in generated schema
      const { data, error } = await supabase
        .from('insight_feedback_quality' as 'ai_insight_feedback')
        .select('tenant_id, insight_type, total_feedback, useful_count, noise_count, false_positive_count, quality_score, last_feedback_at')
        .eq('tenant_id', activeTenant.id);

      if (error) {
        logger.debug('insight_feedback_quality view not accessible:', { error: error.message });
        return [] as import('@/types/views').InsightFeedbackQualityRow[];
      }

      return (data || []) as unknown as import('@/types/views').InsightFeedbackQualityRow[];
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 120000, // 2 minutes
  });
}
