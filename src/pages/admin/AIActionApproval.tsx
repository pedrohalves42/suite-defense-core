import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, AlertTriangle, Info, Loader2, Sparkles, Brain, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface AIAction {
  id: string;
  insight_id: string;
  tenant_id: string;
  action_type: string;
  action_payload: any;
  status: string;
  created_at: string;
  ai_insights?: {
    title: string;
    description: string;
    severity: string;
    confidence_score: number;
    evidence: any;
  };
  ai_action_executions?: Array<{
    execution_status: string;
    execution_result: any;
    error_message: string;
    executed_at: string;
  }>;
}

interface ActionConfig {
  action_type: string;
  description: string;
  risk_level: string;
  max_executions_per_day: number;
}

interface AIInsight {
  id: string;
  title: string;
  description: string;
  severity: string;
  recommendation: string | null;
  confidence_score: number | null;
  created_at: string;
  acknowledged: boolean;
}

export default function AIActionApproval() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Buscar acoes pendentes
  const { data: pendingActions, isLoading } = useQuery({
    queryKey: ['ai-actions-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_actions')
        .select(`
          *,
          ai_insights (*),
          ai_action_executions (*)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AIAction[];
    },
    refetchInterval: 10000,
  });

  // Buscar insights recentes (últimos 30 dias)
  const { data: recentInsights } = useQuery({
    queryKey: ['ai-insights-recent'],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, title, description, severity, recommendation, confidence_score, created_at, acknowledged')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as AIInsight[];
    },
  });

  // Buscar configuracoes de acoes
  const { data: actionConfigs } = useQuery({
    queryKey: ['ai-action-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_action_configs')
        .select('*')
        .eq('is_enabled', true);

      if (error) throw error;
      return data as ActionConfig[];
    },
  });

  // Mutation para executar acao
  const executeAction = useMutation({
    mutationFn: async (actionId: string) => {
      const { data, error } = await supabase.functions.invoke('ai-action-executor', {
        body: { action_id: actionId }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, actionId) => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      setExecutingActions(prev => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
      
      toast({
        title: 'Acao Executada',
        description: 'A acao foi executada com sucesso.',
      });
    },
    onError: (error: any, actionId) => {
      setExecutingActions(prev => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
      
      toast({
        title: 'Erro ao Executar Acao',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation para rejeitar acao
  const rejectAction = useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from('ai_actions')
        .update({ status: 'rejected' })
        .eq('id', actionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      toast({
        title: 'Acao Rejeitada',
        description: 'A acao foi marcada como rejeitada.',
      });
    },
  });

  const handleApprove = (actionId: string) => {
    setExecutingActions(prev => new Set(prev).add(actionId));
    executeAction.mutate(actionId);
  };

  const handleReject = (actionId: string) => {
    rejectAction.mutate(actionId);
  };

  const getActionConfig = (actionType: string) => {
    return actionConfigs?.find(c => c.action_type === actionType);
  };

  const getRiskBadge = (riskLevel: string) => {
    const variants: Record<string, any> = {
      low: { variant: 'default', icon: Info },
      medium: { variant: 'secondary', icon: AlertTriangle },
      high: { variant: 'destructive', icon: AlertTriangle },
    };

    const config = variants[riskLevel] || variants.medium;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {riskLevel.toUpperCase()}
      </Badge>
    );
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, any> = {
      low: 'default',
      medium: 'secondary',
      high: 'destructive',
      critical: 'destructive',
    };

    return <Badge variant={variants[severity] || 'default'}>{severity}</Badge>;
  };

  // Executar análise manual
  const handleAnalyzeNow = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-system-analyzer');
      
      if (error) throw error;
      
      toast({
        title: 'Análise Concluída',
        description: `${data.insightsGenerated || 0} insights gerados para ${data.tenantsAnalyzed || 0} tenant(s).`,
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights-recent'] });
    } catch (error) {
      toast({
        title: 'Erro na Análise',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-500/10';
      case 'warning': return 'text-yellow-500 bg-yellow-500/10';
      default: return 'text-blue-500 bg-blue-500/10';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - LINGUAGEM HUMANA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Decisões Automáticas</h1>
          <p className="text-muted-foreground mt-2">
            O CyberShield pode tomar decisões automáticas para proteger sua empresa. Todas são registradas e podem ser revisadas aqui.
          </p>
        </div>
        <Button 
          onClick={handleAnalyzeNow} 
          disabled={isAnalyzing}
          className="gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <Brain className="h-4 w-4" />
              Verificar Agora
            </>
          )}
        </Button>
      </div>

      {/* Insights Recentes - LINGUAGEM HUMANA */}
      {recentInsights && recentInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              O que o sistema detectou recentemente
            </CardTitle>
            <CardDescription>
              Descobertas e recomendações dos últimos 30 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentInsights.map((insight) => (
                <div 
                  key={insight.id} 
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className={`p-2 rounded-full ${getSeverityColor(insight.severity)}`}>
                    {insight.severity === 'critical' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : insight.severity === 'warning' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Info className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{insight.title}</p>
                      <Badge variant="outline" className="text-xs">
                        {Math.round((insight.confidence_score || 0) * 100)}% confiança
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {insight.description}
                    </p>
                    {insight.recommendation && (
                      <p className="text-xs text-primary mt-2">
                        💡 {insight.recommendation}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatBrazilDateTime(insight.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado Vazio - LINGUAGEM HUMANA */}
      {(!recentInsights || recentInsights.length === 0) && pendingActions?.length === 0 && (
        <Alert className="border-dashed">
          <Brain className="h-4 w-4" />
          <AlertTitle>Nenhuma descoberta ainda</AlertTitle>
          <AlertDescription className="mt-2">
            O sistema analisa seus computadores automaticamente todos os dias às 09:00. 
            Você também pode clicar em "Verificar Agora" para executar uma análise manual.
          </AlertDescription>
        </Alert>
      )}

      {/* Ações Pendentes - LINGUAGEM HUMANA */}
      {pendingActions && pendingActions.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Decisões Aguardando Sua Aprovação</h2>
        </div>
      )}

      <div className="grid gap-4">
        {pendingActions?.map((action) => {
          const config = getActionConfig(action.action_type);
          const isExecuting = executingActions.has(action.id);

          return (
            <Card key={action.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {action.ai_insights?.title || 'Acao Sugerida'}
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        Pendente
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {action.ai_insights?.description}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {config && getRiskBadge(config.risk_level)}
                    {action.ai_insights && getSeverityBadge(action.ai_insights.severity)}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Tipo de Acao */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">Tipo de Acao</h3>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {action.action_type}
                    </code>
                    {config && (
                      <span className="text-sm text-muted-foreground">
                        {config.description}
                      </span>
                    )}
                  </div>
                </div>

                {/* Payload */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">Detalhes da Acao</h3>
                  <div className="bg-muted p-3 rounded text-sm">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(action.action_payload, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Evidencias */}
                {action.ai_insights?.evidence && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Evidencias</h3>
                    <div className="bg-muted p-3 rounded text-sm">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(action.ai_insights.evidence, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Confianca da IA */}
                {action.ai_insights?.confidence_score && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Confianca da IA</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${action.ai_insights.confidence_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {action.ai_insights.confidence_score}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Rate Limit */}
                {config && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Limite de Execucoes</h3>
                    <p className="text-sm text-muted-foreground">
                      Maximo de {config.max_executions_per_day} execucoes por dia
                    </p>
                  </div>
                )}

                {/* Botoes de Acao */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleApprove(action.id)}
                    disabled={isExecuting || executeAction.isPending}
                    className="gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Executando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Aprovar e Executar
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReject(action.id)}
                    disabled={isExecuting || rejectAction.isPending}
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
