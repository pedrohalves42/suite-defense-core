/**
 * AI Approval Metrics Card - Mostra taxa de aprovação/rejeição de ações IA
 * Etapa 5 do plano de melhoria 68% → 80%
 * 
 * Se 100% de aprovação, mostra alerta de "fadiga de aprovação"
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Brain, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface ApprovalMetrics {
  total_actions: number;
  approved: number;
  rejected: number;
  pending: number;
  approval_rate: number;
}

export function AIApprovalMetrics() {
  const { tenant } = useTenant();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['ai-approval-metrics', tenant?.id],
    queryFn: async (): Promise<ApprovalMetrics> => {
      if (!tenant?.id) return {
        total_actions: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        approval_rate: 0,
      };

      // Fetch AI insights and calculate approval metrics
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, acknowledged')
        .eq('tenant_id', tenant.id);

      if (error) {
        console.error('Error fetching AI approval metrics:', error);
        return {
          total_actions: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          approval_rate: 0,
        };
      }

      // Use acknowledged as "approved" metric
      const approved = data?.filter(a => a.acknowledged === true).length || 0;
      const pending = data?.filter(a => a.acknowledged === false || a.acknowledged === null).length || 0;
      // Estimate rejection rate based on dismissed insights (we track as 0 rejections if no explicit rejection)
      const total_actions = data?.length || 0;
      const rejected = 0; // No explicit rejection tracking in current schema
      const approval_rate = total_actions > 0 ? (approved / total_actions) * 100 : 0;

      return {
        total_actions,
        approved,
        rejected,
        pending,
        approval_rate,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000,
  });

  const isSuspicious = metrics && metrics.approval_rate === 100 && metrics.total_actions >= 5;
  const isHealthy = metrics && metrics.approval_rate < 100 && metrics.approval_rate >= 70;
  const hasEnoughData = metrics && metrics.total_actions >= 3;

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
        isHealthy && "border-green-500/30 bg-green-500/5"
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
          <div className="flex items-center justify-around text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-green-600">
                <ThumbsUp className="h-4 w-4" />
                <span className="font-bold text-lg">{metrics.approved}</span>
              </div>
              <span className="text-xs text-muted-foreground">Aprovadas</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-red-500">
                <ThumbsDown className="h-4 w-4" />
                <span className="font-bold text-lg">{metrics.rejected}</span>
              </div>
              <span className="text-xs text-muted-foreground">Rejeitadas</span>
            </div>
            {metrics.pending > 0 && (
              <>
                <div className="w-px h-8 bg-border" />
                <div className="space-y-1">
                  <span className="font-bold text-lg text-muted-foreground">{metrics.pending}</span>
                  <span className="text-xs text-muted-foreground">Pendentes</span>
                </div>
              </>
            )}
          </div>

          {/* Warning */}
          {isSuspicious && (
            <div className="p-2 bg-amber-500/10 rounded text-xs text-amber-600 dark:text-amber-400">
              <strong>⚠️ Alerta de Fadiga:</strong> 100% de aprovação pode indicar que ações 
              estão sendo aprovadas sem revisão adequada. Considere revisar as últimas decisões.
            </div>
          )}

          {/* Healthy message */}
          {isHealthy && hasEnoughData && (
            <div className="p-2 bg-green-500/10 rounded text-xs text-green-600 dark:text-green-400">
              <strong>✓ Revisão Saudável:</strong> A taxa de rejeição indica que as ações de IA 
              estão sendo revisadas criteriosamente.
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
