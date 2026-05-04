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
      'flex items-center gap-6 rounded-2xl border p-5 shadow-elevated relative overflow-hidden group transition-all duration-500 hover:shadow-float',
      isUrgent 
        ? 'bg-destructive/5 border-destructive/20' 
        : 'bg-primary/5 border-primary/10',
      className
    )}>
      {/* Glossy overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
      
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-premium group-hover:scale-110 transition-transform duration-500',
        isUrgent ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
      )}>
        <Zap className="h-6 w-6" />
      </div>
      
      <div className="flex-1 min-w-0 relative z-10">
        <span className="section-label mb-1 block">Próxima Ação Prioritária</span>
        <p className="text-[17px] font-bold tracking-tight text-foreground">{displayTitle}</p>
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mt-1 opacity-80">
          <Monitor className="h-3.5 w-3.5" />{agentDisplay}
        </p>
      </div>

      <Button 
        size="lg"
        onClick={handleExecute}
        disabled={executeAction.isPending}
        className={cn(
          'shrink-0 h-12 px-8 rounded-xl font-bold shadow-premium interactive-hover',
          isUrgent 
            ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' 
            : 'bg-primary hover:bg-primary/90 text-primary-foreground'
        )}
      >
        {executeAction.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>{displayCta}<ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" /></>
        )}
      </Button>
    </div>
  );
}
