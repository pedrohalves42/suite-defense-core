/**
 * AI Approval Metrics Card - Mostra taxa de aprovação/rejeição de ações IA
 * Etapa 5 do plano de melhoria 68% → 80%
 * 
 * AJUSTE 1: Exporta isSuspiciousPattern para forçar fricção
 * AJUSTE 4: Métricas expandidas com dismissals e reviews com comentário
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Brain, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle, MessageSquare, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger';

export interface ApprovalMetrics {
  total_actions: number;
  approved: number;
  rejected: number;
  pending: number;
  dismissed: number;
  reviews_with_notes: number;
  approval_rate: number;
  isSuspiciousPattern: boolean;
}

// Export the hook for other components to check suspicious pattern
export function useApprovalMetrics() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['ai-approval-metrics', tenant?.id],
    queryFn: async (): Promise<ApprovalMetrics> => {
      if (!tenant?.id) return {
        total_actions: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        dismissed: 0,
        reviews_with_notes: 0,
        approval_rate: 0,
        isSuspiciousPattern: false,
      };

      // Fetch AI insights
      const { data: insightsData, error: insightsError } = await supabase
        .from('ai_insights')
        .select('id, acknowledged, dismissed_at')
        .eq('tenant_id', tenant.id);

      if (insightsError) {
        logger.error('Error fetching AI approval metrics:', insightsError);
        return {
          total_actions: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          dismissed: 0,
          reviews_with_notes: 0,
          approval_rate: 0,
          isSuspiciousPattern: false,
        };
      }

      // Fetch decision events to count reviews with notes
      const { data: decisionData } = await supabase
        .from('decision_events')
        .select('id, evidence')
        .eq('tenant_id', tenant.id)
        .in('rule_code', ['AI_ACTION_APPROVAL', 'AI_INSIGHT_DISMISSAL']);

      // Count reviews that have approval_notes or forced_review
      const reviewsWithNotes = decisionData?.filter(d => {
        const evidence = d.evidence as any | null;
        return evidence?.approval_notes || evidence?.forced_review;
      }).length || 0;

      const approved = insightsData?.filter(a => a.acknowledged === true).length || 0;
      const dismissed = insightsData?.filter(a => a.dismissed_at !== null).length || 0;
      const pending = insightsData?.filter(a => !a.acknowledged && !a.dismissed_at).length || 0;
      const total_actions = insightsData?.length || 0;
      const rejected = dismissed; // Dismissals count as "rejections" for audit purposes
      const approval_rate = total_actions > 0 ? (approved / total_actions) * 100 : 0;

      // AJUSTE 1: Padrão suspeito quando 100% aprovação e >= 5 ações
      const isSuspiciousPattern = approval_rate === 100 && total_actions >= 5;

      return {
        total_actions,
        approved,
        rejected,
        pending,
        dismissed,
        reviews_with_notes: reviewsWithNotes,
        approval_rate,
        isSuspiciousPattern,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false, // COST-OPT: 60s → 5min
  });
}

export function AIApprovalMetrics() {
  const { data: metrics, isLoading } = useApprovalMetrics();

  const isSuspicious = metrics?.isSuspiciousPattern;
  const isHealthy = metrics && metrics.approval_rate < 100 && metrics.approval_rate >= 70;
  const hasEnoughData = metrics && metrics.total_actions >= 3;
  const hasDismissals = metrics && metrics.dismissed > 0;

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-5 bg-muted rounded w-40" />
        </CardHeader>
        <CardContent>
          <div className="h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.total_actions === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Taxa de Aprovação IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhuma ação de IA avaliada ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className={cn(
        "border",
        isSuspicious && "border-amber-500/30 bg-amber-500/5",
        isHealthy && "border-green-500/30 bg-green-500/5",
        hasDismissals && !isSuspicious && "border-blue-500/30"
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Taxa de Aprovação IA
            {isSuspicious && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Verificar
              </Badge>
            )}
            {isHealthy && (
              <Badge variant="outline" className="text-green-600 border-green-500/50">
                <CheckCircle className="h-3 w-3 mr-1" />
                Saudável
              </Badge>
            )}
            {hasDismissals && (
              <Badge variant="outline" className="text-blue-600 border-blue-500/50">
                <XCircle className="h-3 w-3 mr-1" />
                {metrics.dismissed} dismissal{metrics.dismissed > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Approval Rate Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Taxa de Aprovação</span>
              <span className={cn(
                "font-bold",
                isSuspicious && "text-amber-600",
                isHealthy && "text-green-600"
              )}>
                {metrics.approval_rate.toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={metrics.approval_rate} 
              className={cn(
                "h-2",
                isSuspicious && "[&>div]:bg-amber-500",
                isHealthy && "[&>div]:bg-green-500"
              )}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-green-600">
                <ThumbsUp className="h-3 w-3" />
                <span className="font-bold">{metrics.approved}</span>
              </div>
              <span className="text-xs text-muted-foreground">Aprovadas</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-red-500">
                <ThumbsDown className="h-3 w-3" />
                <span className="font-bold">{metrics.rejected}</span>
              </div>
              <span className="text-xs text-muted-foreground">Rejeitadas</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-blue-500">
                <MessageSquare className="h-3 w-3" />
                <span className="font-bold">{metrics.reviews_with_notes}</span>
              </div>
              <span className="text-xs text-muted-foreground">C/ Notas</span>
            </div>
            {metrics.pending > 0 && (
              <div className="space-y-1">
                <span className="font-bold text-muted-foreground">{metrics.pending}</span>
                <span className="text-xs text-muted-foreground">Pendentes</span>
              </div>
            )}
          </div>

          {/* Warning */}
          {isSuspicious && (
            <div className="p-2 bg-amber-500/10 rounded text-xs text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <strong>⚠️ Alerta de Fadiga:</strong> 100% de aprovação pode indicar que ações 
              estão sendo aprovadas sem revisão adequada. <strong>Justificativa obrigatória ativada.</strong>
            </div>
          )}

          {/* Healthy message */}
          {isHealthy && hasEnoughData && (
            <div className="p-2 bg-green-500/10 rounded text-xs text-green-600 dark:text-green-400">
              <strong>✓ Revisão Saudável:</strong> A taxa de rejeição indica que as ações de IA 
              estão sendo revisadas criteriosamente.
            </div>
          )}

          {/* Dismissal evidence */}
          {hasDismissals && (
            <div className="p-2 bg-blue-500/10 rounded text-xs text-blue-600 dark:text-blue-400">
              <strong>📋 Evidência de Discordância:</strong> {metrics.dismissed} insight(s) foram 
              dispensados, demonstrando capacidade de discordar da IA.
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
