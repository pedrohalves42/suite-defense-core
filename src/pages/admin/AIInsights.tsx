import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain, AlertTriangle, Info, CheckCircle, TrendingUp, Clock, Sparkles, Shield, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AIInsightExplainer } from "@/components/admin/AIInsightExplainer";
import { InsightsTrendChart } from "@/components/admin/InsightsTrendChart";
import { InsightFeedbackButtons } from "@/components/insights/InsightFeedbackButtons";
import { FeedbackStatsCard } from "@/components/admin/FeedbackStatsCard";
import { AIApprovalMetrics } from "@/components/admin/AIApprovalMetrics";
import { DismissInsightDialog } from "@/components/insights/DismissInsightDialog";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
interface AIInsight {
  id: string;
  tenant_id: string;
  insight_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence: any;
  recommendation: string;
  confidence_score: number;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
}

interface Statistics {
  total: number;
  critical: number;
  warning: number;
  info: number;
  acknowledged: number;
  pending: number;
}

export default function AIInsights() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [selectedInsightForDismiss, setSelectedInsightForDismiss] = useState<{ id: string; title: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '50',
      });

      const { data, error } = await supabase.functions.invoke(
        `ai-get-insights?${params.toString()}`,
        { method: 'GET' }
      );

      if (error) throw error;
      return data as { insights: AIInsight[]; statistics: Statistics };
    },
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // V-1088 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('ai_insights')
        .update({
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', insightId)
        .eq('tenant_id', tenant!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success('Insight marcado como reconhecido');
    },
    onError: (error) => {
      toast.error('Erro ao reconhecer insight: ' + error.message);
    },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async (insightIds: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('ai_insights')
        .update({
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .in('id', insightIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success('Todos os insights foram reconhecidos');
    },
    onError: (error) => {
      toast.error('Erro ao reconhecer insights: ' + error.message);
    },
  });

  const executeSolutionMutation = useMutation({
    mutationFn: async ({ actionId, solutionType, parameters }: { actionId: string; solutionType: string; parameters?: any }) => {
      const { data, error } = await supabase.functions.invoke('ai-execute-solution', {
        body: { action_id: actionId, solution_type: solutionType, parameters }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success('Solucao aplicada com sucesso', {
        description: JSON.stringify(data.result)
      });
    },
    onError: (error: any) => {
      toast.error('Erro ao executar solucao', {
        description: error.message
      });
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <Info className="h-5 w-5 text-info" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      anomaly_detection: 'Deteccao de Anomalia',
      optimization: 'Otimizacao',
      prediction: 'Predicao',
      root_cause: 'Causa Raiz',
    };
    return labels[type] || type;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const insights = data?.insights || [];
  const stats = data?.statistics || {
    total: 0,
    critical: 0,
    warning: 0,
    info: 0,
    acknowledged: 0,
    pending: 0,
  };

  const pendingInsights = insights.filter(i => !i.acknowledged);
  const acknowledgedInsights = insights.filter(i => i.acknowledged);

  // Get global status
  const getGlobalStatus = () => {
    if (stats.critical > 0) {
      return {
        emoji: '🔴',
        title: 'Ação urgente necessária',
        description: `${stats.critical} aviso${stats.critical > 1 ? 's' : ''} crítico${stats.critical > 1 ? 's' : ''} precisam da sua atenção imediata.`,
        variant: 'danger' as const
      };
    }
    if (stats.warning > 0) {
      return {
        emoji: '🟡',
        title: 'Avisos pendentes',
        description: `${stats.warning} aviso${stats.warning > 1 ? 's' : ''} merecem sua verificação.`,
        variant: 'warning' as const
      };
    }
    return {
      emoji: '🟢',
      title: 'Tudo sob controle',
      description: 'Nenhum aviso urgente no momento. Continue monitorando.',
      variant: 'success' as const
    };
  };

  const globalStatus = getGlobalStatus();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Avisos do Sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            O CyberShield detectou situações que merecem sua atenção
          </p>
        </div>
        {pendingInsights.length > 0 && (
          <Button
            onClick={() => acknowledgeAllMutation.mutate(pendingInsights.map(i => i.id))}
            disabled={acknowledgeAllMutation.isPending}
            size="sm"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Entendi Todos ({pendingInsights.length})
          </Button>
        )}
      </div>

      {/* 🔐 CAMADA 1: Status Global */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn(
          "border-2",
          globalStatus.variant === 'success' && "bg-green-500/5 border-green-500/30",
          globalStatus.variant === 'warning' && "bg-amber-500/5 border-amber-500/30",
          globalStatus.variant === 'danger' && "bg-red-500/5 border-red-500/30"
        )}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-full",
                globalStatus.variant === 'success' && "bg-green-500/10",
                globalStatus.variant === 'warning' && "bg-amber-500/10",
                globalStatus.variant === 'danger' && "bg-red-500/10"
              )}>
                <Shield className={cn(
                  "h-10 w-10",
                  globalStatus.variant === 'success' && "text-green-500",
                  globalStatus.variant === 'warning' && "text-amber-500",
                  globalStatus.variant === 'danger' && "text-red-500"
                )} />
              </div>
              <div className="flex-1">
                <h2 className={cn(
                  "text-xl font-bold",
                  globalStatus.variant === 'success' && "text-green-600 dark:text-green-400",
                  globalStatus.variant === 'warning' && "text-amber-600 dark:text-amber-400",
                  globalStatus.variant === 'danger' && "text-red-600 dark:text-red-400"
                )}>
                  {globalStatus.emoji} {globalStatus.title}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {globalStatus.description}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 🔢 CAMADA 2: KPIs - Máximo 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.critical}</div>
              <p className="text-xs text-muted-foreground">
                {stats.critical > 0 ? 'Precisam de ação imediata' : '✓ Nenhum urgente'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-yellow-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Atenção</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.warning}</div>
              <p className="text-xs text-muted-foreground">
                {stats.warning > 0 ? 'Vale a pena verificar' : '✓ Sem pendências'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-l-4 border-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolvidos</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.acknowledged}</div>
              <p className="text-xs text-muted-foreground">
                De {stats.total} no total
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 📈 CAMADA 3: Gráfico de Tendência + Feedback Stats + Approval Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <InsightsTrendChart />
        </div>
        <FeedbackStatsCard />
        <AIApprovalMetrics />
      </div>

      {/* Insights Tabs - LINGUAGEM HUMANA */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Aguardando ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="acknowledged" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Resolvidos ({stats.acknowledged})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingInsights.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Tudo certo por aqui!</AlertTitle>
              <AlertDescription>
                O sistema está monitorando seus computadores continuamente. Novos avisos aparecerão aqui automaticamente quando algo precisar da sua atenção.
              </AlertDescription>
            </Alert>
          ) : (
            pendingInsights.map((insight) => (
              <Card key={insight.id} className="border-l-4" style={{
                borderLeftColor: insight.severity === 'critical' ? 'hsl(var(--destructive))' : 
                               insight.severity === 'warning' ? 'hsl(var(--warning))' : 
                               'hsl(var(--info))'
              }}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getSeverityIcon(insight.severity)}
                      <div className="flex-1">
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {insight.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge variant={getSeverityColor(insight.severity) as any}>
                        {insight.severity}
                      </Badge>
                      <Badge variant="outline">
                        {getTypeLabel(insight.insight_type)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Recommendation */}
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm mb-1">Recomendacao:</p>
                        <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
                      </div>
                    </div>
                  </div>

                  {/* Evidence */}
                  {insight.evidence && Object.keys(insight.evidence).length > 0 && (
                    <div className="border rounded-lg p-4 space-y-3">
                      <p className="font-semibold text-sm">Evidências:</p>
                      
                      {/* Key metrics grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        {insight.evidence.failureRate !== undefined && (
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground text-xs block">Taxa de Falha</span>
                            <span className="font-semibold">{Number(insight.evidence.failureRate).toFixed(1)}%</span>
                          </div>
                        )}
                        {insight.evidence.avgCpuUsage !== undefined && (
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground text-xs block">CPU Média</span>
                            <span className="font-semibold">{Number(insight.evidence.avgCpuUsage).toFixed(1)}%</span>
                          </div>
                        )}
                        {insight.evidence.avgMemoryUsage !== undefined && (
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground text-xs block">Memória Média</span>
                            <span className="font-semibold">{Number(insight.evidence.avgMemoryUsage).toFixed(1)}%</span>
                          </div>
                        )}
                        {insight.evidence.problematicJobsCount !== undefined && (
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground text-xs block">Jobs Problemáticos</span>
                            <span className="font-semibold">{insight.evidence.problematicJobsCount}</span>
                          </div>
                        )}
                        {insight.evidence.systemAlertsCount !== undefined && (
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground text-xs block">Alertas do Sistema</span>
                            <span className="font-semibold text-destructive">{insight.evidence.systemAlertsCount}</span>
                          </div>
                        )}
                      </div>

                      {/* Evidence Pack - detailed data points */}
                      {Array.isArray(insight.evidence.evidence_pack) && insight.evidence.evidence_pack.length > 0 && (
                        <div className="space-y-2">
                          <p className="font-semibold text-xs text-muted-foreground">Pontos de Dados Detalhados:</p>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {insight.evidence.evidence_pack.map((ep: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 text-xs bg-muted/30 rounded p-2">
                                <Badge variant={
                                  ep.severity === 'critical' ? 'destructive' : 
                                  ep.severity === 'warning' ? 'outline' : 'secondary'
                                } className="text-[10px] shrink-0 mt-0.5">
                                  {ep.severity}
                                </Badge>
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium">{ep.data_point}</span>
                                  {ep.value !== undefined && (
                                    <span className="text-muted-foreground ml-1">
                                      {typeof ep.value === 'object' 
                                        ? Object.entries(ep.value).map(([k, v]) => `${k}: ${v}`).join(', ')
                                        : typeof ep.value === 'number' ? Number(ep.value).toFixed(1) : String(ep.value)
                                      }
                                    </span>
                                  )}
                                  {ep.source_table && (
                                    <span className="text-muted-foreground/60 ml-1 text-[10px]">({ep.source_table})</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Data sources */}
                      {Array.isArray(insight.evidence.data_sources) && (
                        <div className="text-xs text-muted-foreground">
                          <span>Fontes: </span>
                          {insight.evidence.data_sources.map((src: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] mr-1">{src}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Reasoning summary */}
                      {insight.evidence.reasoning_summary && (
                        <p className="text-xs text-muted-foreground italic border-t pt-2">
                          {insight.evidence.reasoning_summary}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Feedback Buttons */}
                  <div className="pt-2 border-t">
                    <InsightFeedbackButtons insightId={insight.id} />
                  </div>

                  {/* Metadata and Actions */}
                  <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Confiança: {(insight.confidence_score * 100).toFixed(0)}%</span>
                      <span>•</span>
                      <span>{formatDate(insight.created_at)}</span>
                      <AIInsightExplainer
                        insightId={insight.id}
                        title={insight.title}
                        description={insight.description}
                        evidence={insight.evidence}
                        confidence={insight.confidence_score}
                        insightType={insight.insight_type}
                        severity={insight.severity}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Auto-solution buttons based on insight type */}
                      {insight.insight_type === 'agent_health' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => executeSolutionMutation.mutate({
                            actionId: insight.id,
                            solutionType: 'cleanup_stuck_jobs'
                          })}
                          disabled={executeSolutionMutation.isPending}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Limpar Jobs Travados
                        </Button>
                      )}
                      {insight.insight_type === 'system_alerts' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => executeSolutionMutation.mutate({
                            actionId: insight.id,
                            solutionType: 'acknowledge_alerts'
                          })}
                          disabled={executeSolutionMutation.isPending}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Reconhecer Alertas
                        </Button>
                      )}
                      {insight.insight_type === 'missing_data' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => executeSolutionMutation.mutate({
                            actionId: insight.id,
                            solutionType: 'create_security_jobs'
                          })}
                          disabled={executeSolutionMutation.isPending}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Criar Jobs de Coleta
                        </Button>
                      )}
                      
                      {/* AJUSTE 3: Botão de Dispensar Insight */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedInsightForDismiss({ id: insight.id, title: insight.title });
                          setDismissDialogOpen(true);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Dispensar
                      </Button>
                      
                      <Button
                        size="sm"
                        onClick={() => acknowledgeMutation.mutate(insight.id)}
                        disabled={acknowledgeMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Reconhecer
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="acknowledged" className="space-y-4">
          {acknowledgedInsights.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Nenhum insight reconhecido ainda</AlertTitle>
              <AlertDescription>
                Insights reconhecidos aparecerao aqui para referencia historica.
              </AlertDescription>
            </Alert>
          ) : (
            acknowledgedInsights.map((insight) => (
              <Card key={insight.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getSeverityIcon(insight.severity)}
                      <div className="flex-1">
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {insight.description}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Reconhecido
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Feedback on acknowledged insights */}
                  <InsightFeedbackButtons insightId={insight.id} compact />
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDate(insight.created_at)}</span>
                    {insight.acknowledged_at && (
                      <span>Reconhecido em {formatDate(insight.acknowledged_at)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog para Dispensar Insight */}
      {selectedInsightForDismiss && (
        <DismissInsightDialog
          open={dismissDialogOpen}
          onOpenChange={setDismissDialogOpen}
          insightId={selectedInsightForDismiss.id}
          insightTitle={selectedInsightForDismiss.title}
        />
      )}
    </div>
  );
}
