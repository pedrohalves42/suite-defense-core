import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain, AlertTriangle, Info, CheckCircle, TrendingUp, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";

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

  const { data, isLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-get-insights', {
        body: { page: 1, limit: 50 }
      });

      if (error) throw error;
      return data as { insights: AIInsight[]; statistics: Statistics };
    },
    refetchInterval: 60000, // Atualizar a cada minuto
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('ai_insights')
        .update({
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', insightId);

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
      anomaly_detection: 'Detecção de Anomalia',
      optimization: 'Otimização',
      prediction: 'Predição',
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            IA de Autoaprendizado
          </h1>
          <p className="text-muted-foreground mt-2">
            Insights gerados automaticamente pela análise de dados do sistema
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          FASE 1: IA Observadora
        </Badge>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Insights</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pending} pendentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">
              Requerem atenção imediata
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avisos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.warning}</div>
            <p className="text-xs text-muted-foreground">
              Investigação recomendada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconhecidos</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.acknowledged}</div>
            <p className="text-xs text-muted-foreground">
              De {stats.total} totais
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Insights Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pendentes ({pendingInsights.length})
          </TabsTrigger>
          <TabsTrigger value="acknowledged" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Reconhecidos ({acknowledgedInsights.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingInsights.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Nenhum insight pendente</AlertTitle>
              <AlertDescription>
                A IA está monitorando o sistema continuamente. Novos insights aparecerão aqui automaticamente.
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
                        <p className="font-semibold text-sm mb-1">Recomendação:</p>
                        <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
                      </div>
                    </div>
                  </div>

                  {/* Evidence */}
                  {insight.evidence && Object.keys(insight.evidence).length > 0 && (
                    <div className="border rounded-lg p-4">
                      <p className="font-semibold text-sm mb-2">Evidências:</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {insight.evidence.failureRate !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Taxa de Falha:</span>
                            <span className="ml-2 font-medium">{insight.evidence.failureRate.toFixed(1)}%</span>
                          </div>
                        )}
                        {insight.evidence.avgCpuUsage !== undefined && (
                          <div>
                            <span className="text-muted-foreground">CPU Média:</span>
                            <span className="ml-2 font-medium">{insight.evidence.avgCpuUsage.toFixed(1)}%</span>
                          </div>
                        )}
                        {insight.evidence.avgMemoryUsage !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Memória Média:</span>
                            <span className="ml-2 font-medium">{insight.evidence.avgMemoryUsage.toFixed(1)}%</span>
                          </div>
                        )}
                        {insight.evidence.problematicJobsCount !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Jobs Problemáticos:</span>
                            <span className="ml-2 font-medium">{insight.evidence.problematicJobsCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Confiança: {(insight.confidence_score * 100).toFixed(0)}%</span>
                      <span>•</span>
                      <span>{formatDate(insight.created_at)}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => acknowledgeMutation.mutate(insight.id)}
                      disabled={acknowledgeMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Reconhecer
                    </Button>
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
                Insights reconhecidos aparecerão aqui para referência histórica.
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
                <CardContent>
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
    </div>
  );
}
