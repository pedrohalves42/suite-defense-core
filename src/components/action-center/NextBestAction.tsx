import { useActionCenter } from '@/hooks/useActionCenter';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Monitor, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useExecuteActionItem } from '@/hooks/useActionCenter';
import { getActionCopy, generateDynamicContent } from './ActionCopyMap';

interface NextBestActionProps {
  onExecute?: () => void;
  className?: string;
}

export function NextBestAction({ onExecute, className }: NextBestActionProps) {
  const { data } = useActionCenter();
  const navigate = useNavigate();
  const executeAction = useExecuteActionItem();

  const topAction = data?.urgent?.[0] || data?.recommended?.[0];
  if (!topAction) return null;

  const copy = getActionCopy(topAction.trigger_type);
  const dynamicContent = generateDynamicContent(
    topAction.trigger_type,
    topAction.context,
    topAction.agent_name,
    topAction.hostname
  );

  const displayTitle = topAction.humanized?.title || dynamicContent.title || copy.title;
  const displayCta = topAction.humanized?.cta || dynamicContent.cta || copy.cta;
  const agentDisplay = topAction.agent_name || topAction.hostname || 'Sistema';
  const isUrgent = topAction.severity === 'critical' || topAction.severity === 'urgent';

  const handleExecute = async () => {
    const isInvestigateAction = 
      topAction.source_type === 'ai_insight' && 
      (topAction.trigger_type.includes('anomaly') || 
       topAction.trigger_type === 'performance');

    if (isInvestigateAction && topAction.agent_id) {
      navigate(`/admin/agent-health?agent=${topAction.agent_id}`);
      await executeAction.mutateAsync({
        itemId: topAction.item_id,
        sourceType: topAction.source_type,
        action: 'acknowledge',
      });
    } else {
      await executeAction.mutateAsync({
        itemId: topAction.item_id,
        sourceType: topAction.source_type,
        action: 'execute',
      });
    }
    onExecute?.();
  };

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border p-3',
      isUrgent 
        ? 'bg-red-500/5 border-red-500/20' 
        : 'bg-amber-500/5 border-amber-500/20',
      className
    )}>
      <Zap className={cn('h-4 w-4 shrink-0', isUrgent ? 'text-red-500' : 'text-amber-500')} />
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Próxima ação</p>
        <p className="text-sm font-medium truncate">{displayTitle}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Monitor className="h-3 w-3" />{agentDisplay}
        </p>
      </div>

      <Button 
        size="sm"
        onClick={handleExecute}
        disabled={executeAction.isPending}
        className={cn(
          'shrink-0',
          isUrgent 
            ? 'bg-red-600 hover:bg-red-700 text-white' 
            : 'bg-amber-600 hover:bg-amber-700 text-white'
        )}
      >
        {executeAction.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>{displayCta}<ArrowRight className="h-3.5 w-3.5 ml-1" /></>
        )}
      </Button>
    </div>
  );
}
