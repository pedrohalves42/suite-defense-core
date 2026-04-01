import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export type FeedbackType = 'useful' | 'noise' | 'false_positive';

export interface InsightWithFeedback {
  id: string;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  created_at: string;
  auto_executed: boolean;
  feedback_type?: FeedbackType;
  feedback_comment?: string;
}

export interface FeedbackStats {
  total: number;
  useful: number;
  noise: number;
  falsePositive: number;
  pending: number;
}

export function useAIFeedbackDashboard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['ai-feedback-insights', tenant?.id],
    queryFn: async (): Promise<InsightWithFeedback[]> => {
      if (!tenant?.id) return [];

      const { data: insightsData, error } = await supabase
        .from('ai_insights')
        .select('id, insight_type, severity, title, description, created_at, auto_action_executed')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const insightIds = (insightsData || []).map((i: any) => i.id);
      if (insightIds.length === 0) return [];

      const { data: feedbackData } = await supabase
        .from('ai_insight_feedback')
        .select('insight_id, feedback_type, comment')
        .eq('tenant_id', tenant.id)
        .in('insight_id', insightIds);

      const feedbackMap = new Map(
        (feedbackData || []).map((f: any) => [f.insight_id, { type: f.feedback_type, comment: f.comment }])
      );

      return (insightsData || []).map((insight: any) => ({
        id: insight.id,
        insight_type: insight.insight_type,
        severity: insight.severity,
        title: insight.title,
        description: insight.description,
        created_at: insight.created_at,
        auto_executed: insight.auto_action_executed || false,
        feedback_type: feedbackMap.get(insight.id)?.type as FeedbackType | undefined,
        feedback_comment: feedbackMap.get(insight.id)?.comment,
      }));
    },
    enabled: !!tenant?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ['ai-feedback-stats', tenant?.id],
    queryFn: async (): Promise<FeedbackStats> => {
      if (!tenant?.id) return { total: 0, useful: 0, noise: 0, falsePositive: 0, pending: 0 };

      const { data, error } = await supabase
        .from('ai_insight_feedback')
        .select('feedback_type')
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      const total = data.length;
      const useful = data.filter((f: any) => f.feedback_type === 'useful').length;
      const noise = data.filter((f: any) => f.feedback_type === 'noise').length;
      const falsePositive = data.filter((f: any) => f.feedback_type === 'false_positive').length;
      const pending = (insights?.filter(i => !i.feedback_type).length) || 0;

      return { total, useful, noise, falsePositive, pending };
    },
    enabled: !!tenant?.id && !!insights,
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ insightId, feedbackType, comment }: {
      insightId: string;
      feedbackType: FeedbackType;
      comment?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('ai_insight_feedback')
        .upsert({
          tenant_id: tenant!.id,
          insight_id: insightId,
          user_id: user.user.id,
          feedback_type: feedbackType,
          comment: comment || null,
        }, {
          onConflict: 'insight_id,user_id',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback-insights'] });
      queryClient.invalidateQueries({ queryKey: ['ai-feedback-stats'] });
      setActiveComment(null);
      setCommentText('');
      toast.success('Feedback registrado com sucesso');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const handleFeedback = (insightId: string, type: FeedbackType) => {
    if (type === 'false_positive' || type === 'noise') {
      setActiveComment(insightId);
      submitFeedback.mutate({ insightId, feedbackType: type });
    } else {
      submitFeedback.mutate({ insightId, feedbackType: type });
    }
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-feedback-insights'] });
    queryClient.invalidateQueries({ queryKey: ['ai-feedback-stats'] });
  };

  const usefulRate = stats?.total ? Math.round((stats.useful / stats.total) * 100) : 0;

  const pieData = stats ? [
    { name: 'Útil', value: stats.useful, color: '#22c55e' },
    { name: 'Ruído', value: stats.noise, color: '#f97316' },
    { name: 'Falso+', value: stats.falsePositive, color: '#ef4444' },
  ].filter(d => d.value > 0) : [];

  const typeBreakdown = insights?.reduce((acc, i) => {
    const type = i.insight_type || 'unknown';
    if (!acc[type]) acc[type] = { total: 0, useful: 0, noise: 0, false_positive: 0 };
    acc[type].total++;
    if (i.feedback_type) acc[type][i.feedback_type]++;
    return acc;
  }, {} as Record<string, { total: number; useful: number; noise: number; false_positive: number }>) || {};

  const barData = Object.entries(typeBreakdown).map(([type, counts]) => ({
    type: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    Útil: counts.useful,
    Ruído: counts.noise,
    'Falso+': counts.false_positive,
    'Sem avaliação': counts.total - counts.useful - counts.noise - counts.false_positive,
  }));

  return {
    insights,
    insightsLoading,
    stats,
    usefulRate,
    pieData,
    barData,
    activeComment,
    setActiveComment,
    commentText,
    setCommentText,
    submitFeedback,
    handleFeedback,
    refreshAll,
  };
}
