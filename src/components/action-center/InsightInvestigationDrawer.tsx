/**
 * InsightInvestigationDrawer - Drawer for investigating AI insights
 * 
 * Provides:
 * - Overview with insight details and evidence
 * - Embedded diagnostic panel
 * - Actionable buttons for real actions
 */

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DiagnosticPanel } from '@/components/agent/DiagnosticPanel';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';
import { ActionItem } from '@/hooks/useActionCenter';
import { useTenant } from '@/hooks/useTenant';
import { getSuggestedActions } from '@/lib/insight-action-mapping';
import { executeInsightAction, getActionLabel } from '@/lib/insight-actions';
import { humanizeEvidence } from '@/lib/humanize-evidence';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { 
  Sparkles, 
  Activity, 
  Zap, 
  Target,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface InsightInvestigationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ActionItem;
  onActionComplete?: () => void;
}

export function InsightInvestigationDrawer({ 
  open, 
  onOpenChange, 
  item,
  onActionComplete 
}: InsightInvestigationDrawerProps) {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const suggestedActions = getSuggestedActions(item.trigger_type);
  
  // Extract metrics from evidence
  const evidence = item.context?.evidence as Record<string, unknown> | undefined;
  const evidencePack = evidence?.evidence_pack as Array<Record<string, unknown>> | undefined;
  
  let metrics: { cpu?: number; memory?: number; disk?: number } = {};
  if (evidencePack && Array.isArray(evidencePack)) {
    const agentEntry = evidencePack.find(entry => 
      typeof entry.data_point === 'string' && (entry.data_point as string).startsWith('Agente com Problema:')
    );
    if (agentEntry && typeof agentEntry.value === 'object' && agentEntry.value !== null) {
      metrics = agentEntry.value as typeof metrics;
    }
  }

  // Detecta se é um insight de sistema (sem agente vinculado)
  const isSystemInsight = !item.agent_id;

  const handleAction = async (action: string) => {
    // Para insights de sistema (sem agente), tratar de forma especial
    if (isSystemInsight) {
      if (action === 'navigate_agent') {
        toast.info('Este insight é de sistema e não está vinculado a um agente específico');
        return;
      }
      // Permitir apenas resolução para insights de sistema
      toast.info('Ações específicas de agente não disponíveis para insights de sistema. Use "Marcar como Resolvido".');
      return;
    }

    if (!tenant?.id) {
      toast.error('Tenant não identificado');
      return;
    }

    // Handle navigation separately
    if (action === 'navigate_agent') {
      navigate(`/admin/agent-health?agent=${item.agent_id}`);
      onOpenChange(false);
      return;
    }

    setExecutingAction(action);
    try {
      const result = await executeInsightAction(
        action,
        item.agent_id!,
        item.agent_name || 'Agent',
        tenant.id,
        item.item_id
      );
      
      if (result.success) {
        toast.success(result.message);
        if (result.jobId) {
          toast.info(`Job criado: ${result.jobId.slice(0, 8)}...`);
        }
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Erro ao executar ação');
    } finally {
      setExecutingAction(null);
    }
  };

  const handleResolve = () => {
    onActionComplete?.();
    onOpenChange(false);
    toast.success('Insight marcado como resolvido');
  };

  const confidenceScore = typeof item.context?.confidence_score === 'number' 
    ? Math.round(item.context.confidence_score * 100) 
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[640px] overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant={item.severity === 'critical' ? 'destructive' : 'secondary'}
              className="shrink-0"
            >
              {item.severity}
            </Badge>
            <span className="truncate">{item.agent_name || item.hostname}</span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Detectado {formatDistanceToNow(new Date(item.created_at), { locale: ptBR, addSuffix: true })}
          </SheetDescription>
        </SheetHeader>
        
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden mt-4">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="overview" className="text-xs">
              <Target className="h-3.5 w-3.5 mr-1" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="text-xs">
              <Activity className="h-3.5 w-3.5 mr-1" />
              Diagnóstico
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs">
              <Zap className="h-3.5 w-3.5 mr-1" />
              Ações
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="overview" className="space-y-4 m-0 pr-4">
              {/* What was detected */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    O que foi detectado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{item.description}</p>
                  
                  {/* Confidence Score */}
                  {confidenceScore !== null && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'text-xs',
                        confidenceScore >= 80 ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                        confidenceScore >= 60 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                        'bg-gray-500/10 text-gray-600 border-gray-500/20'
                      )}
                    >
                      {confidenceScore}% certeza
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Metrics at detection */}
              {(metrics.cpu !== undefined || metrics.memory !== undefined || metrics.disk !== undefined) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Métricas no momento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {metrics.cpu !== undefined && (
                        <div className={cn(
                          "p-3 rounded-lg text-center",
                          metrics.cpu > 90 ? "bg-destructive/10" : "bg-muted/50"
                        )}>
                          <Cpu className={cn(
                            "h-5 w-5 mx-auto mb-1",
                            metrics.cpu > 90 ? "text-destructive" : "text-muted-foreground"
                          )} />
                          <p className="text-lg font-bold">{Math.round(metrics.cpu)}%</p>
                          <p className="text-xs text-muted-foreground">CPU</p>
                        </div>
                      )}
                      {metrics.memory !== undefined && (
                        <div className={cn(
                          "p-3 rounded-lg text-center",
                          metrics.memory > 90 ? "bg-destructive/10" : "bg-muted/50"
                        )}>
                          <MemoryStick className={cn(
                            "h-5 w-5 mx-auto mb-1",
                            metrics.memory > 90 ? "text-destructive" : "text-muted-foreground"
                          )} />
                          <p className="text-lg font-bold">{Math.round(metrics.memory)}%</p>
                          <p className="text-xs text-muted-foreground">RAM</p>
                        </div>
                      )}
                      {metrics.disk !== undefined && (
                        <div className={cn(
                          "p-3 rounded-lg text-center",
                          metrics.disk > 90 ? "bg-destructive/10" : "bg-muted/50"
                        )}>
                          <HardDrive className={cn(
                            "h-5 w-5 mx-auto mb-1",
                            metrics.disk > 90 ? "text-destructive" : "text-muted-foreground"
                          )} />
                          <p className="text-lg font-bold">{Math.round(metrics.disk)}%</p>
                          <p className="text-xs text-muted-foreground">Disco</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Evidence */}
              {item.context?.evidence && typeof item.context.evidence === 'object' && (() => {
                const humanizedItems = humanizeEvidence(item.context.evidence as any);
                if (humanizedItems.length === 0) return null;
                
                return (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Evidências coletadas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        {humanizedItems.map((evidenceItem, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg"
                          >
                            <span className="text-xs text-muted-foreground">{evidenceItem.label}</span>
                            <span className="text-sm font-medium">{evidenceItem.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Agent state */}
              {item.agent_id && (
                <AgentStateExplainer agentId={item.agent_id} tenantId={tenant?.id} compact />
              )}
            </TabsContent>
            
            <TabsContent value="diagnostics" className="m-0 pr-4">
              {item.agent_id && tenant?.id ? (
                <DiagnosticPanel
                  agentId={item.agent_id}
                  agentName={item.agent_name || 'Agent'}
                  tenantId={tenant.id}
                  variant="full"
                  intent="triage"
                />
              ) : (
                <Alert>
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <AlertDescription>
                    Este é um insight de sistema. Diagnósticos específicos de agente não estão disponíveis.
                    <br />
                    <span className="text-muted-foreground text-xs">
                      Utilize a aba "Ações" para marcar como resolvido ou ignorar.
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
            
            <TabsContent value="actions" className="space-y-4 m-0 pr-4">
              {/* Suggested Actions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    Ações Disponíveis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {suggestedActions.length > 0 ? (
                    suggestedActions.map((action, idx) => (
                      <Button 
                        key={idx}
                        variant={action.requires_approval ? 'outline' : 'default'}
                        className={cn(
                          "w-full justify-between",
                          action.requires_approval && "border-amber-500/30"
                        )}
                        onClick={() => handleAction(action.action)}
                        disabled={executingAction !== null}
                      >
                        <span className="flex items-center gap-2">
                          {executingAction === action.action ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {getActionLabel(action.action)}
                        </span>
                        {action.requires_approval && (
                          <Badge variant="outline" className="text-xs">
                            Aprovação
                          </Badge>
                        )}
                      </Button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma ação automática disponível para este tipo de insight.
                    </p>
                  )}
                  
                  {/* Generic actions always available */}
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground mb-2">Ações gerais:</p>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => handleAction('collect_logs')}
                      disabled={executingAction !== null}
                    >
                      {executingAction === 'collect_logs' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Coletar Logs do Agente
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => handleAction('force_health_report')}
                      disabled={executingAction !== null}
                    >
                      {executingAction === 'force_health_report' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Forçar Relatório de Saúde
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => handleAction('ping')}
                      disabled={executingAction !== null}
                    >
                      {executingAction === 'ping' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Testar Conectividade
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Resolution buttons */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resolver Insight</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    className="w-full" 
                    onClick={handleResolve}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Resolvido
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start"
                    onClick={() => {
                      if (item.agent_id) {
                        navigate(`/admin/diagnostics?agent=${item.agent_id}`);
                        onOpenChange(false);
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir Central de Diagnósticos
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
