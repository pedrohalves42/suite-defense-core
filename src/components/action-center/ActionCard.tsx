import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Clock,
  CheckCircle2,
  Loader2,
  X,
  ChevronRight,
  Monitor,
  AlertTriangle,
  HelpCircle,
  Cpu,
  HardDrive,
  MemoryStick,
  Globe,
  Shield,
  Zap,
  Search,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ActionItem, useExecuteActionItem } from '@/hooks/useActionCenter';
import { getActionCopy, SEVERITY_CONFIG, generateDynamicContent } from './ActionCopyMap';
import { Link, useNavigate } from 'react-router-dom';
import { hToast } from '@/lib/humanized-toast';
import { ArchiveReasonTree } from './ArchiveReasonTree';

interface ActionCardProps {
  item: ActionItem;
  compact?: boolean;
  onExecuted?: () => void;
}

// Helper to extract key metrics from context
function extractKeyMetrics(context: Record<string, unknown>, triggerType: string): { icon: typeof Cpu; label: string; value: string }[] {
  const metrics: { icon: typeof Cpu; label: string; value: string }[] = [];
  
  if (typeof context.cpu_percent === 'number') {
    metrics.push({ icon: Cpu, label: 'CPU', value: `${Math.round(context.cpu_percent)}%` });
  }
  if (typeof context.memory_percent === 'number') {
    metrics.push({ icon: MemoryStick, label: 'RAM', value: `${Math.round(context.memory_percent)}%` });
  }
  if (typeof context.disk_percent === 'number') {
    metrics.push({ icon: HardDrive, label: 'Disco', value: `${Math.round(context.disk_percent)}%` });
  }
  if (typeof context.blocked_requests === 'number') {
    metrics.push({ icon: Shield, label: 'Bloqueados', value: `${context.blocked_requests}` });
  }
  if (typeof context.hours_offline === 'number') {
    metrics.push({ icon: Clock, label: 'Offline', value: `${context.hours_offline}h` });
  }
  if (context.duration && typeof context.duration === 'string') {
    metrics.push({ icon: Clock, label: 'Duração', value: context.duration });
  }
  if (context.process_name && typeof context.process_name === 'string') {
    metrics.push({ icon: Zap, label: 'Processo', value: context.process_name });
  }
  if (context.domain && typeof context.domain === 'string') {
    metrics.push({ icon: Globe, label: 'Domínio', value: context.domain });
  }
  if (typeof context.failure_count === 'number') {
    metrics.push({ icon: AlertTriangle, label: 'Falhas', value: `${context.failure_count}x` });
  }
  if (typeof context.confidence_score === 'number') {
    metrics.push({ icon: HelpCircle, label: 'Confiança', value: `${Math.round(context.confidence_score * 100)}%` });
  }

  return metrics.slice(0, 4); // Max 4 metrics
}

export function ActionCard({ item, compact = false, onExecuted }: ActionCardProps) {
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  const navigate = useNavigate();
  
  const executeAction = useExecuteActionItem();
  const copy = getActionCopy(item.trigger_type);
  const severityConfig = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.medium;
  const Icon = copy.icon;
  
  // Check if this is an investigate-type action (anomalies, ai insights without direct action)
  const isInvestigateAction = 
    item.source_type === 'ai_insight' && 
    (item.trigger_type.includes('anomaly') || 
     item.trigger_type === 'performance' || 
     item.trigger_type === 'security_posture' ||
     !item.context?.recommended_actions);
  
  // Generate dynamic content based on context
  const dynamicContent = generateDynamicContent(item.trigger_type, item.context, item.agent_name, item.hostname);
  
  // Extract key metrics
  const keyMetrics = extractKeyMetrics(item.context || {}, item.trigger_type);

  const handleExecute = async () => {
    // For investigate actions, navigate to agent details instead of executing
    if (isInvestigateAction && item.agent_id) {
      hToast.info('Abrindo investigação do agente...');
      navigate(`/admin/agent-health?agent=${item.agent_id}`);
      // Also acknowledge the insight so it's marked as seen
      await executeAction.mutateAsync({
        itemId: item.item_id,
        sourceType: item.source_type,
        action: 'acknowledge',
      });
      onExecuted?.();
      return;
    }
    
    await executeAction.mutateAsync({
      itemId: item.item_id,
      sourceType: item.source_type,
      action: 'execute',
    });
    onExecuted?.();
  };

  const handleIgnore = async () => {
    if (!ignoreReason.trim()) return;
    await executeAction.mutateAsync({
      itemId: item.item_id,
      sourceType: item.source_type,
      action: 'ignore',
      reason: ignoreReason,
    });
    setIgnoreDialogOpen(false);
    setIgnoreReason('');
    onExecuted?.();
  };

  const handleAcknowledge = async () => {
    await executeAction.mutateAsync({
      itemId: item.item_id,
      sourceType: item.source_type,
      action: 'acknowledge',
    });
    onExecuted?.();
  };

  // Use humanized copy if available, otherwise use dynamic or from map
  const displayTitle = item.humanized?.title || dynamicContent.title || copy.title;
  const displayDescription = item.humanized?.description || dynamicContent.description || item.description || copy.description;
  const displayCta = item.humanized?.cta || dynamicContent.cta || copy.cta;
  const whyUrgent = dynamicContent.whyUrgent || copy.impact;
  const agentDisplay = item.agent_name || item.hostname || 'Sistema';

  if (compact) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent/50',
        severityConfig.bgClassName
      )}>
        <div className={cn('rounded-full p-2', `${severityConfig.iconClassName.replace('text-', 'bg-')}/20`)}>
          <Icon className={cn('h-4 w-4', severityConfig.iconClassName)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayTitle}</p>
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <Monitor className="h-3 w-3" />
            {agentDisplay}
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={handleExecute} disabled={executeAction.isPending}>
                {executeAction.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  displayCta
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{copy.ctaTooltip || 'Clique para executar a ação recomendada'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <>
      <Card className={cn(
        'border-l-4 transition-all hover:shadow-md',
        severityConfig.borderClassName,
        severityConfig.bgClassName
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'rounded-full p-2.5 shrink-0',
                `${severityConfig.iconClassName.replace('text-', 'bg-')}/20`
              )}>
                <Icon className={cn('h-5 w-5', severityConfig.iconClassName)} />
              </div>
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <span className="truncate">{displayTitle}</span>
                  <Badge variant="outline" className={cn('shrink-0', severityConfig.className)}>
                    {severityConfig.label}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-2 font-medium">
                  <Monitor className="h-4 w-4 shrink-0" />
                  <span className="text-foreground">{agentDisplay}</span>
                  {item.hostname && item.agent_name && (
                    <span className="text-muted-foreground">({item.hostname})</span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(item.created_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* What's happening section */}
          <div className="bg-background/50 rounded-lg p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                O que está acontecendo
              </p>
              <p className="text-sm">{displayDescription}</p>
            </div>
            
            {/* Why it's urgent section */}
            {whyUrgent && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Por que é urgente
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-400">{whyUrgent}</p>
              </div>
            )}
          </div>

          {/* Key Metrics Display */}
          {keyMetrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keyMetrics.map((metric, idx) => {
                const MetricIcon = metric.icon;
                return (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 rounded-md text-xs">
                    <MetricIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{metric.label}:</span>
                    <span className="font-semibold">{metric.value}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Archive Reason Tree - if agent was archived */}
          {item.context?.suppression_reason === 'agent_archived' && item.agent_id && (
            <ArchiveReasonTree agentId={item.agent_id} />
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleExecute}
                    disabled={executeAction.isPending}
                    className="flex-1 min-w-[120px]"
                  >
                    {executeAction.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isInvestigateAction ? (
                      <Search className="h-4 w-4 mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    {displayCta}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="max-w-xs">
                    {isInvestigateAction 
                      ? 'Este alerta não tem ação automática — abrirá contexto completo do agente para análise manual'
                      : copy.ctaTooltip || 'Aplicar a correção recomendada automaticamente'
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {item.source_type === 'playbook' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => setIgnoreDialogOpen(true)}
                      disabled={executeAction.isPending}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Ignorar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Descartar esta ação sem executar. Informe o motivo para registro.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {item.source_type === 'alert' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={handleAcknowledge}
                      disabled={executeAction.isPending}
                    >
                      Reconhecer
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Marcar como visto, mas não tomar ação automática</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {item.source_type === 'ai_insight' && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleAcknowledge}
                        disabled={executeAction.isPending}
                      >
                        Reconhecer
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Marcar insight como revisado sem executar ação</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {item.context?.confidence_score && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="ml-auto cursor-help">
                          {Math.round(Number(item.context.confidence_score) * 100)}% confiança
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Nível de confiança da IA na detecção. Valores acima de 80% indicam alta certeza.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}

            {item.source_type === 'agent_offline' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={handleAcknowledge}
                      disabled={executeAction.isPending}
                    >
                      Reconhecer
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Marcar como ciente do status offline</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {item.agent_id && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/admin/agent-health?agent=${item.agent_id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Abrir detalhes do agente para análise manual</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ignore Dialog */}
      <Dialog open={ignoreDialogOpen} onOpenChange={setIgnoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ignorar Ação</DialogTitle>
            <DialogDescription>
              Você está ignorando: <strong>{displayTitle}</strong>
              <br />
              <span className="text-muted-foreground">Agente: {agentDisplay}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo para ignorar esta ação. Isso será registrado para auditoria.
            </p>
            <Textarea
              placeholder="Ex: Falso positivo - computador em manutenção programada"
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIgnoreDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleIgnore}
              disabled={!ignoreReason.trim() || executeAction.isPending}
            >
              {executeAction.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
