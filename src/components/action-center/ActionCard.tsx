import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Clock,
  CheckCircle2,
  Loader2,
  X,
  XCircle,
  ChevronRight,
  Monitor,
  Search,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { ActionItem, useExecuteActionItem } from '@/hooks/useActionCenter';
import { getActionCopy, SEVERITY_CONFIG, generateDynamicContent } from './ActionCopyMap';
import { Link, useNavigate } from 'react-router-dom';
import { hToast } from '@/lib/humanized-toast';
import { RejectInsightDialog } from './RejectInsightDialog';
import { InsightInvestigationDrawer } from './InsightInvestigationDrawer';
import { getSuggestedActions } from '@/lib/insight-action-mapping';
import { executeInsightAction } from '@/lib/insight-actions';
import { useTenant } from '@/hooks/useTenant';
import { EffectivenessBadge } from './EffectivenessBadge';

interface ActionCardProps {
  item: ActionItem;
  compact?: boolean;
  onExecuted?: () => void;
}

export function ActionCard({ item, compact = false, onExecuted }: ActionCardProps) {
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [investigationDrawerOpen, setInvestigationDrawerOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const navigate = useNavigate();
  const { tenant } = useTenant();
  
  const executeAction = useExecuteActionItem();
  const copy = getActionCopy(item.trigger_type);
  const severityConfig = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.medium;
  const Icon = copy.icon;
  
  const isInvestigateAction = 
    item.source_type === 'ai_insight' && 
    (item.trigger_type.includes('anomaly') || 
     item.trigger_type === 'performance' || 
     item.trigger_type === 'security_posture' ||
     !item.context?.recommended_actions);
  
  const isAIInsight = item.source_type === 'ai_insight';
  
  // Generate dynamic content based on context
  const dynamicContent = generateDynamicContent(item.trigger_type, item.context, item.agent_name, item.hostname);
  
  // Get suggested actions for this insight type
  const suggestedActions = isAIInsight ? getSuggestedActions(item.trigger_type) : [];

  const handleSuggestedAction = async (actionType: string) => {
    if (actionType === 'navigate_agent' && item.agent_id) {
      navigate(`/admin/agent-health?agent=${item.agent_id}`);
      return;
    }

    if (!tenant?.id) {
      hToast.error('Tenant não identificado. Faça login novamente.');
      return;
    }
    
    if (!item.agent_id) {
      hToast.info('Este insight é de nível sistema - marcando como revisado');
      try {
        await executeAction.mutateAsync({
          itemId: item.item_id,
          sourceType: item.source_type,
          action: 'acknowledge',
        });
        onExecuted?.();
      } catch (error) {
        console.error('[ActionCard] Error acknowledging system insight:', error);
        hToast.error('Erro ao marcar como revisado');
      }
      return;
    }

    setExecutingAction(actionType);
    try {
      const result = await executeInsightAction(
        actionType,
        item.agent_id,
        item.agent_name || 'Agent',
        tenant.id,
        item.item_id
      );
      
      if (result.success) {
        hToast.success(result.message);
        if (result.jobId) {
          hToast.info(`Job criado: ${result.jobId.slice(0, 8)}...`);
        }
      } else {
        hToast.error(result.message);
      }
    } catch (error) {
      console.error('Error executing suggested action:', error);
      hToast.error('Erro ao executar ação');
    } finally {
      setExecutingAction(null);
    }
  };

  const handleExecute = async () => {
    if (isInvestigateAction && item.agent_id) {
      setInvestigationDrawerOpen(true);
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

  // Display text
  const displayTitle = item.humanized?.title || dynamicContent.title || copy.title;
  const displayDescription = item.humanized?.description || item.description || dynamicContent.description || copy.description;
  const displayCta = isInvestigateAction 
    ? 'Verificar' 
    : (item.humanized?.cta || dynamicContent.cta || 'Resolver');
  const agentDisplay = item.agent_name || item.hostname || 'Sistema';

  // Compact mode - simple inline row
  if (compact) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent/50',
        severityConfig.bgClassName
      )}>
        <Icon className={cn('h-4 w-4 shrink-0', severityConfig.iconClassName)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayTitle}</p>
          <p className="text-xs text-muted-foreground truncate">{agentDisplay}</p>
        </div>
        <Button size="sm" onClick={handleExecute} disabled={executeAction.isPending}>
          {executeAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : displayCta}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card className={cn(
        'border-l-4 transition-all hover:shadow-sm',
        severityConfig.borderClassName,
        severityConfig.bgClassName
      )}>
        <CardContent className="p-4">
          {/* Main row: icon + info + time + action */}
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={cn(
              'rounded-full p-2 shrink-0 mt-0.5',
              `${severityConfig.iconClassName.replace('text-', 'bg-')}/20`
            )}>
              <Icon className={cn('h-4 w-4', severityConfig.iconClassName)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
              {/* Title + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{displayTitle}</span>
                <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1.5 py-0', severityConfig.className)}>
                  {severityConfig.label}
                </Badge>
                {isAIInsight && (
                  <Badge variant="secondary" className="shrink-0 gap-0.5 text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-600 border-purple-500/20">
                    <Sparkles className="h-2.5 w-2.5" />
                    IA
                  </Badge>
                )}
                {item.is_historical && item.effectiveness_status && (
                  <EffectivenessBadge
                    status={item.effectiveness_status}
                    checkedAt={item.effectiveness_checked_at}
                    evidence={item.effectiveness_evidence}
                  />
                )}
              </div>

              {/* Agent + time inline */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Monitor className="h-3 w-3" />
                  {agentDisplay}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>

              {/* Description - one line, expandable */}
              <p className={cn(
                "text-sm text-muted-foreground",
                !expanded && "line-clamp-1"
              )}>
                {displayDescription}
              </p>

              {/* Expand toggle if description is long */}
              {displayDescription && displayDescription.length > 80 && (
                <button 
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  {expanded ? 'Menos' : 'Mais detalhes'}
                  <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
                </button>
              )}

              {/* Suggested Actions - only when expanded or few actions */}
              {expanded && isAIInsight && suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {suggestedActions.slice(0, 3).map((action, idx) => (
                    <Button 
                      key={idx} 
                      variant="outline" 
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleSuggestedAction(action.action)}
                      disabled={executingAction !== null}
                    >
                      {executingAction === action.action && (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      )}
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions - compact column */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={handleExecute}
                    disabled={executeAction.isPending}
                    className="h-8"
                  >
                    {executeAction.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isInvestigateAction ? (
                      <><Search className="h-3.5 w-3.5 mr-1" />{displayCta}</>
                    ) : (
                      <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />{displayCta}</>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{copy.ctaTooltip || 'Executar ação recomendada'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Secondary action */}
              {item.source_type === 'playbook' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setIgnoreDialogOpen(true)} disabled={executeAction.isPending}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Ignorar</p></TooltipContent>
                </Tooltip>
              )}

              {(item.source_type === 'alert' || item.source_type === 'agent_offline') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleAcknowledge} disabled={executeAction.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Entendido</p></TooltipContent>
                </Tooltip>
              )}

              {item.source_type === 'ai_insight' && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleAcknowledge} disabled={executeAction.isPending}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">Entendido</p></TooltipContent>
                  </Tooltip>
                  {!item.item_id.startsWith('offline_') && 
                   !item.item_id.startsWith('alert_') && 
                   !item.item_id.startsWith('system_') && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => setRejectDialogOpen(true)} disabled={executeAction.isPending}>
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Rejeitar</p></TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}

              {item.agent_id && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-1.5" asChild>
                      <Link to={`/admin/agent-health?agent=${item.agent_id}`}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Ver agente</p></TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ignore Dialog */}
      <Dialog open={ignoreDialogOpen} onOpenChange={setIgnoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar sem Ação</DialogTitle>
            <DialogDescription>
              <strong>{displayTitle}</strong> — {agentDisplay}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo (ex: Falso positivo, manutenção programada)"
            value={ignoreReason}
            onChange={(e) => setIgnoreReason(e.target.value)}
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIgnoreDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleIgnore} disabled={!ignoreReason.trim() || executeAction.isPending}>
              {executeAction.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Insight Dialog */}
      <RejectInsightDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        insightId={item.item_id}
        insightTitle={displayTitle}
        insightType={item.trigger_type}
        agentName={agentDisplay}
        onRejected={onExecuted}
      />

      {/* Investigation Drawer */}
      <InsightInvestigationDrawer
        open={investigationDrawerOpen}
        onOpenChange={setInvestigationDrawerOpen}
        item={item}
        onActionComplete={onExecuted}
      />
    </>
  );
}
