import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, AlertTriangle, Info, Loader2, Sparkles, Brain, Shield, AlertOctagon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useApproveAiAction, useRejectAiAction, requiresFormalApproval, RISK_LEVEL_COLORS } from '@/hooks/useAiActionApproval';
import { useCheckBlastRadius } from '@/hooks/useBlastRadius';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useApprovalMetrics } from '@/components/admin/AIApprovalMetrics';
import { cn } from '@/lib/utils';
import { AutoApprovalPanel } from '@/components/admin/AutoApprovalPanel';
import { RollbackTestPanel } from '@/components/admin/RollbackTestPanel';
import { useTenant } from '@/hooks/useTenant';
import { logger } from '@/lib/logger';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface AIAction {
  id: string;
  insight_id: string;
  tenant_id: string;
  action_type: string;
  action_payload: any;
  status: string;
  created_at: string;
  risk_level?: string;
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
  const adaptiveInterval = useAdaptivePolling(300_000);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading } = useTenant();
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [reviewedDetails, setReviewedDetails] = useState(false);

  // Use the new approval hooks
  const approveAction = useApproveAiAction();
  const rejectAction = useRejectAiAction();
  
  // Check blast radius before approving actions
  const checkBlastRadius = useCheckBlastRadius();
  
  // AJUSTE 1: Check for suspicious pattern
  const { data: approvalMetrics } = useApprovalMetrics();
  const isSuspiciousPattern = approvalMetrics?.isSuspiciousPattern || false;

  // Buscar acoes pendentes - FIX: add tenant_id filter
  const { data: pendingActions, isLoading } = useQuery({
    queryKey: ['ai-actions-pending', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_actions')
        .select(`
          *,
          ai_insights (*),
          ai_action_executions (*)
        `)
        .eq('tenant_id', tenant!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AIAction[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Buscar insights recentes (últimos 30 dias) - FIX: add tenant_id filter
  const { data: recentInsights } = useQuery({
    queryKey: ['ai-insights-recent', tenant?.id],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, title, description, severity, recommendation, confidence_score, created_at, acknowledged')
        .eq('tenant_id', tenant!.id)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as AIInsight[];
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Buscar configuracoes de acoes
  const { data: actionConfigs } = useQuery({
    queryKey: ['ai-action-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_action_configs')
        .select('id, action_type, description, risk_level, requires_approval, is_enabled, max_executions_per_day, circuit_breaker_enabled, current_failures, failure_threshold, failure_window_minutes, circuit_open_until, created_at, updated_at')
        .eq('is_enabled', true);

      if (error) throw error;
      return data as ActionConfig[];
    },
  });

  const handleApproveClick = async (actionId: string, riskLevel: string | null, action?: AIAction) => {
    // Check blast radius before proceeding
    if (action?.action_payload?.affected_count) {
      try {
        const blastResult = await checkBlastRadius.mutateAsync({
          actionType: action.action_type,
          affectedCount: action.action_payload.affected_count
        });
        
        if (!blastResult.allowed) {
          toast({
            title: 'Ação bloqueada pelo Blast Radius',
            description: blastResult.message,
            variant: 'destructive'
          });
          return;
        }
        
        if (blastResult.requires_approval) {
          // Force formal approval dialog
          setSelectedActionId(actionId);
          setSelectedRiskLevel(riskLevel);
          setApprovalNotes(`⚠️ Blast Radius: ${blastResult.message}`);
          setReviewedDetails(false);
          setApprovalDialogOpen(true);
          return;
        }
      } catch (error) {
        logger.error('Blast radius check failed:', error);
        // Continue with normal flow if check fails
      }
    }
    
    // AJUSTE 1: Se padrão suspeito OU high/critical, exigir aprovação formal
    if (isSuspiciousPattern || requiresFormalApproval(riskLevel)) {
      setSelectedActionId(actionId);
      setSelectedRiskLevel(riskLevel);
      setApprovalNotes('');
      setReviewedDetails(false);
      setApprovalDialogOpen(true);
    } else {
      // Direct approval for low/medium risk when not suspicious
      setExecutingActions(prev => new Set(prev).add(actionId));
      approveAction.mutate(
        { actionId },
        {
          onSettled: () => {
            setExecutingActions(prev => {
              const next = new Set(prev);
              next.delete(actionId);
              return next;
            });
          },
        }
      );
    }
  };

  const handleConfirmApproval = () => {
    if (!selectedActionId) return;
    
    setExecutingActions(prev => new Set(prev).add(selectedActionId));
    setApprovalDialogOpen(false);
    
    // AJUSTE 1: Passar forcedReview quando padrão suspeito
    approveAction.mutate(
      { 
        actionId: selectedActionId, 
        approvalNotes,
        forcedReview: isSuspiciousPattern || requiresFormalApproval(selectedRiskLevel),
      },
      {
        onSettled: () => {
          setExecutingActions(prev => {
            const next = new Set(prev);
            next.delete(selectedActionId!);
            return next;
          });
          setSelectedActionId(null);
          setApprovalNotes('');
        },
      }
    );
  };

  const handleReject = (actionId: string) => {
    rejectAction.mutate({ actionId });
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
      {/* Auto-Approval Panel */}
      <AutoApprovalPanel />

      {/* Rollback Test Panel */}
      <RollbackTestPanel />

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
          const isHighRisk = config?.risk_level === 'high' || config?.risk_level === 'critical';

          return (
            <Card 
              key={action.id}
              className={cn(
                isHighRisk && "border-2 border-orange-500/50 bg-orange-500/5"
              )}
            >
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
                
                {/* AJUSTE 2: Banner de alto risco mais visível */}
                {isHighRisk && (
                  <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-2">
                    <AlertOctagon className="h-5 w-5 text-orange-500" />
                    <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                      ⚠️ Ação crítica — revisão atenta recomendada antes de aprovar
                    </span>
                  </div>
                )}
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

                {/* Botoes de Acao - Com indicador de aprovação formal para high/critical ou padrão suspeito */}
                <div className="flex gap-2 pt-4 border-t flex-wrap">
                  {(requiresFormalApproval(config?.risk_level || null) || isSuspiciousPattern) && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "gap-1 mr-2",
                        isSuspiciousPattern && "border-amber-500 text-amber-600"
                      )}
                    >
                      <Shield className="h-3 w-3" />
                      {isSuspiciousPattern ? 'Revisão Obrigatória (Padrão 100%)' : 'Aprovação Formal Requerida'}
                    </Badge>
                  )}
                  <Button
                    onClick={() => handleApproveClick(action.id, config?.risk_level || null, action)}
                    disabled={isExecuting || approveAction.isPending || checkBlastRadius.isPending}
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

      {/* Dialog de Aprovação Formal para Ações High/Critical ou Padrão Suspeito */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isSuspiciousPattern ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Revisão Obrigatória - Padrão Suspeito Detectado
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5 text-amber-500" />
                  Aprovação Formal Requerida
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {isSuspiciousPattern ? (
                <>
                  <strong className="text-amber-600">⚠️ Taxa de aprovação em 100%.</strong> Para evitar 
                  fadiga de aprovação, você deve confirmar que revisou os detalhes desta ação.
                </>
              ) : (
                <>Esta ação requer aprovação formal por ser de alto risco. 
                Por favor, adicione notas explicando sua decisão para fins de auditoria.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* AJUSTE 1: Checkbox de confirmação de revisão */}
            <div className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
              <Checkbox 
                id="reviewedDetails" 
                checked={reviewedDetails}
                onCheckedChange={(checked) => setReviewedDetails(checked === true)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label 
                  htmlFor="reviewedDetails" 
                  className="text-sm font-medium cursor-pointer"
                >
                  Confirmo que revisei os detalhes desta ação
                </Label>
                <p className="text-xs text-muted-foreground">
                  Este registro será mantido para auditoria
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="approvalNotes">
                Notas de aprovação {(isSuspiciousPattern || requiresFormalApproval(selectedRiskLevel)) ? '(obrigatório)' : '(opcional)'}
              </Label>
              <Textarea
                id="approvalNotes"
                placeholder="Explique por que está aprovando esta ação..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmApproval}
              disabled={
                approveAction.isPending || 
                !reviewedDetails || 
                ((isSuspiciousPattern || requiresFormalApproval(selectedRiskLevel)) && !approvalNotes.trim())
              }
              className="gap-2"
            >
              {approveAction.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
