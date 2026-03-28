/**
 * AI Feedback Dashboard
 * Permite que operadores avaliem insights de IA e visualizem métricas de qualidade
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Brain, ThumbsUp, ThumbsDown, Flag, TrendingUp,
  BarChart3, MessageSquare, CheckCircle, XCircle,
  AlertTriangle, Lightbulb, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

type FeedbackType = 'useful' | 'noise' | 'false_positive';

interface InsightWithFeedback {
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

export default function AIFeedbackDashboard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  // Fetch insights with feedback
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['ai-feedback-insights', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data: insightsData, error } = await supabase
        .from('ai_insights')
        .select('id, insight_type, severity, title, description, created_at, auto_action_executed')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch feedback for these insights
      const insightIds = (insightsData || []).map((i: Record<string, unknown>) => i.id);
      if (insightIds.length === 0) return [];

      const { data: feedbackData } = await supabase
        .from('ai_insight_feedback')
        .select('insight_id, feedback_type, comment')
        .eq('tenant_id', tenant.id)
        .in('insight_id', insightIds);

      const feedbackMap = new Map(
        (feedbackData || []).map((f: Record<string, unknown>) => [f.insight_id, { type: f.feedback_type, comment: f.comment }])
      );

      return (insightsData || []).map((insight: Record<string, unknown>) => ({
        id: insight.id,
        insight_type: insight.insight_type,
        severity: insight.severity,
        title: insight.title,
        description: insight.description,
        created_at: insight.created_at,
        auto_executed: insight.auto_action_executed || false,
        feedback_type: feedbackMap.get(insight.id)?.type as FeedbackType | undefined,
        feedback_comment: feedbackMap.get(insight.id)?.comment,
      } as InsightWithFeedback));
    },
    enabled: !!tenant?.id,
  });

  // Fetch aggregated stats
  const { data: stats } = useQuery({
    queryKey: ['ai-feedback-stats', tenant?.id],
    queryFn: async (): Promise<{ total: number; useful: number; noise: number; falsePositive: number; pending: number }> => {
      if (!tenant?.id) return { total: 0, useful: 0, noise: 0, falsePositive: 0, pending: 0 };

      const { data, error } = await supabase
        .from('ai_insight_feedback')
        .select('feedback_type')
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      const total = data.length;
      const useful = data.filter((f: Record<string, unknown>) => f.feedback_type === 'useful').length;
      const noise = data.filter((f: Record<string, unknown>) => f.feedback_type === 'noise').length;
      const falsePositive = data.filter((f: Record<string, unknown>) => f.feedback_type === 'false_positive').length;
      const pending = (insights?.filter(i => !i.feedback_type).length) || 0;

      return { total, useful, noise, falsePositive, pending };
    },
    enabled: !!tenant?.id && !!insights,
  });

  // Submit feedback mutation
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

  const usefulRate = stats?.total ? Math.round((stats.useful / stats.total) * 100) : 0;

  const pieData = stats ? [
    { name: 'Útil', value: stats.useful, color: '#22c55e' },
    { name: 'Ruído', value: stats.noise, color: '#f97316' },
    { name: 'Falso+', value: stats.falsePositive, color: '#ef4444' },
  ].filter(d => d.value > 0) : [];

  // Group by insight type for bar chart
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

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, string> = {
      critical: 'bg-red-500/10 text-red-600 border-red-200',
      high: 'bg-orange-500/10 text-orange-600 border-orange-200',
      medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
      low: 'bg-blue-500/10 text-blue-600 border-blue-200',
      info: 'bg-muted text-muted-foreground',
    };
    return variants[severity] || variants.info;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Qualidade dos Insights de IA
          </h1>
          <p className="text-muted-foreground text-xs">
            Avalie os insights para melhorar continuamente a precisão da análise
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['ai-feedback-insights'] });
            queryClient.invalidateQueries({ queryKey: ['ai-feedback-stats'] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-600">{usefulRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Utilidade</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ThumbsUp className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.useful || 0}</p>
            <p className="text-xs text-muted-foreground">Úteis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ThumbsDown className="h-6 w-6 text-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.noise || 0}</p>
            <p className="text-xs text-muted-foreground">Ruído</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flag className="h-6 w-6 text-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.falsePositive || 0}</p>
            <p className="text-xs text-muted-foreground">Falsos Positivos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Sem Avaliação</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição de Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhum feedback registrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart by Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualidade por Tipo de Insight</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Útil" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Ruído" stackId="a" fill="#f97316" />
                  <Bar dataKey="Falso+" stackId="a" fill="#ef4444" />
                  <Bar dataKey="Sem avaliação" stackId="a" fill="#94a3b8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Dados insuficientes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Insights Recentes — Avalie para Melhorar a IA
          </CardTitle>
          <CardDescription className="text-xs">
            Cada avaliação ajuda a calibrar a precisão dos insights futuros
          </CardDescription>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !insights?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhum insight gerado ainda</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <AnimatePresence>
                <div className="space-y-2">
                  {insights.map((insight, idx) => (
                    <motion.div
                      key={insight.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={cn(
                        "p-3 rounded-lg border transition-colors",
                        insight.feedback_type === 'useful' && "border-green-200 bg-green-500/5",
                        insight.feedback_type === 'noise' && "border-orange-200 bg-orange-500/5",
                        insight.feedback_type === 'false_positive' && "border-red-200 bg-red-500/5",
                        !insight.feedback_type && "border-border"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={cn("text-[10px]", getSeverityBadge(insight.severity))}>
                              {insight.severity}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {insight.insight_type?.replace(/_/g, ' ')}
                            </Badge>
                            {insight.auto_executed && (
                              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600">
                                Auto-executado
                              </Badge>
                            )}
                            {insight.feedback_type && (
                              <Badge variant="outline" className={cn("text-[10px]",
                                insight.feedback_type === 'useful' && "bg-green-500/10 text-green-600",
                                insight.feedback_type === 'noise' && "bg-orange-500/10 text-orange-600",
                                insight.feedback_type === 'false_positive' && "bg-red-500/10 text-red-600",
                              )}>
                                {insight.feedback_type === 'useful' ? '✓ Útil' :
                                 insight.feedback_type === 'noise' ? '⚡ Ruído' : '🚩 Falso+'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate">{insight.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>

                        {/* Feedback buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant={insight.feedback_type === 'useful' ? 'default' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleFeedback(insight.id, 'useful')}
                            disabled={submitFeedback.isPending}
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={insight.feedback_type === 'noise' ? 'default' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleFeedback(insight.id, 'noise')}
                            disabled={submitFeedback.isPending}
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={insight.feedback_type === 'false_positive' ? 'destructive' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleFeedback(insight.id, 'false_positive')}
                            disabled={submitFeedback.isPending}
                          >
                            <Flag className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
