import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

export default function AIActionApproval() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());

  // Buscar ações pendentes
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
    refetchInterval: 10000, // Atualiza a cada 10s
  });

  // Buscar configurações de ações
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

  // Mutation para executar ação
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
        title: 'Ação Executada',
        description: 'A ação foi executada com sucesso.',
      });
    },
    onError: (error: any, actionId) => {
      setExecutingActions(prev => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
      
      toast({
        title: 'Erro ao Executar Ação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation para rejeitar ação
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
        title: 'Ação Rejeitada',
        description: 'A ação foi marcada como rejeitada.',
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Aprovação de Ações da IA</h1>
        <p className="text-muted-foreground mt-2">
          Revise e aprove ações sugeridas pela IA de autoaprendizado
        </p>
      </div>

      {pendingActions && pendingActions.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Nenhuma ação pendente de aprovação no momento.
          </AlertDescription>
        </Alert>
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
                      {action.ai_insights?.title || 'Ação Sugerida'}
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
                {/* Tipo de Ação */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">Tipo de Ação</h3>
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
                  <h3 className="font-semibold text-sm mb-2">Detalhes da Ação</h3>
                  <div className="bg-muted p-3 rounded text-sm">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(action.action_payload, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Evidências */}
                {action.ai_insights?.evidence && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Evidências</h3>
                    <div className="bg-muted p-3 rounded text-sm">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(action.ai_insights.evidence, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Confiança da IA */}
                {action.ai_insights?.confidence_score && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Confiança da IA</h3>
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
                    <h3 className="font-semibold text-sm mb-2">Limite de Execuções</h3>
                    <p className="text-sm text-muted-foreground">
                      Máximo de {config.max_executions_per_day} execuções por dia
                    </p>
                  </div>
                )}

                {/* Botões de Ação */}
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
