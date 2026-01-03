import { useActionCenter, ActionItem } from '@/hooks/useActionCenter';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Monitor } from 'lucide-react';
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

  // Get highest priority action
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
    <div 
      className={cn(
        'relative overflow-hidden rounded-xl border-2 p-4 transition-all',
        isUrgent 
          ? 'bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent border-red-500/30' 
          : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30',
        className
      )}
    >
      {/* Subtle pulse animation for urgent */}
      {isUrgent && (
        <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
      )}

      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            'shrink-0 p-2 rounded-lg',
            isUrgent ? 'bg-red-500/20' : 'bg-amber-500/20'
          )}>
            <Zap className={cn(
              'h-5 w-5',
              isUrgent ? 'text-red-500' : 'text-amber-500'
            )} />
          </div>
          
          <div className="min-w-0">
            <p className={cn(
              'text-xs font-semibold uppercase tracking-wide mb-0.5',
              isUrgent ? 'text-red-500' : 'text-amber-600'
            )}>
              👉 Próxima ação recomendada
            </p>
            <p className="font-medium truncate">{displayTitle}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Monitor className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{agentDisplay}</span>
            </p>
          </div>
        </div>

        <Button 
          onClick={handleExecute}
          disabled={executeAction.isPending}
          className={cn(
            'shrink-0 gap-2',
            isUrgent 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          )}
        >
          {executeAction.isPending ? 'Executando...' : displayCta}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
