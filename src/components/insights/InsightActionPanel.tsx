import { useState } from 'react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Play, 
  Eye, 
  X,
  Brain,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface Insight {
  id: string;
  insight_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string | null;
  acknowledged: boolean;
  created_at: string;
  agent_id?: string;
  metadata?: any;
}

const severityConfig = {
  critical: { color: 'bg-destructive text-destructive-foreground', icon: AlertTriangle },
  warning: { color: 'bg-yellow-500/20 text-yellow-600', icon: AlertTriangle },
  info: { color: 'bg-blue-500/20 text-blue-600', icon: Eye },
};

export function InsightActionPanel() {
  const adaptiveInterval = useAdaptivePolling(300000);
  // V-302: Add loading guard to prevent race conditions during tenant sync
  const { activeTenant, loading } = useActiveTenant();
  const tenantId = activeTenant?.id;
  const queryClient = useQueryClient();
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  const { data: insights, isLoading } = useQuery({
    queryKey: ['pending-insights', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, tenant_id, insight_type, title, description, severity, recommendation, category, confidence_score, acknowledged, status, created_at')
        .eq('tenant_id', tenantId)
        .eq('acknowledged', false)
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        severity: item.severity as 'critical' | 'warning' | 'info',
        recommendation: item.recommendation || null,
      })) as Insight[];
    },
    // V-302: Guard with !loading to prevent queries before JWT sync completes
    enabled: !loading && !!tenantId,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (insightId: string) => {
      // V-1059 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('ai_insights')
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', insightId)
        .eq('tenant_id', tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-insights'] });
      toast.success('Insight marcado como reconhecido');
      setSelectedInsight(null);
    },
    onError: () => {
      toast.error('Erro ao reconhecer insight');
    },
  });

  const executeActionMutation = useMutation({
    mutationFn: async (insight: Insight) => {
      // Create an AI action based on the insight
      const { error } = await supabase
        .from('ai_actions')
        .insert([{
          tenant_id: tenantId,
          insight_id: insight.id,
          action_type: insight.insight_type,
          action_payload: JSON.parse(JSON.stringify({
            insight_title: insight.title,
            recommendation: insight.recommendation,
            agent_id: insight.agent_id,
            metadata: insight.metadata || {},
          })),
          status: 'pending',
        }]);

      if (error) throw error;

      // Mark insight as acknowledged
      // V-1059 FIX: Add tenant_id filter
      await supabase
        .from('ai_insights')
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', insight.id)
        .eq('tenant_id', tenantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-insights'] });
      toast.success('Ação criada com sucesso');
      setSelectedInsight(null);
    },
    onError: () => {
      toast.error('Erro ao criar ação');
    },
  });

  const pendingCount = insights?.length || 0;
  const criticalCount = insights?.filter(i => i.severity === 'critical').length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Insights Pendentes
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive">{criticalCount} críticos</Badge>
            )}
            <Badge variant="secondary">{pendingCount} pendentes</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {pendingCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
            <p className="text-muted-foreground">Nenhum insight pendente</p>
            <p className="text-sm text-muted-foreground/70">Todos os insights foram processados</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {insights?.map((insight) => {
                const config = severityConfig[insight.severity];
                const Icon = config.icon;

                return (
                  <div
                    key={insight.id}
                    className={`p-4 rounded-lg border transition-all cursor-pointer hover:bg-accent/50 ${
                      selectedInsight?.id === insight.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedInsight(insight)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${config.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{insight.title}</span>
                            <Badge variant="outline" className="text-xs">
                              {insight.insight_type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {insight.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatBrazilDateTime(insight.created_at, 'short')}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>

                    {selectedInsight?.id === insight.id && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {insight.recommendation && (
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Ação Sugerida:
                            </p>
                            <p className="text-sm">{insight.recommendation}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {insight.recommendation && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                executeActionMutation.mutate(insight);
                              }}
                              disabled={executeActionMutation.isPending}
                            >
                              {executeActionMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-2" />
                              )}
                              Executar Ação
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              acknowledgeMutation.mutate(insight.id);
                            }}
                            disabled={acknowledgeMutation.isPending}
                          >
                            {acknowledgeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 mr-2" />
                            )}
                            Descartar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}