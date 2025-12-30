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
  Clock,
  CheckCircle2,
  Loader2,
  X,
  ChevronRight,
  Monitor,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ActionItem, useExecuteActionItem } from '@/hooks/useActionCenter';
import { getActionCopy, SEVERITY_CONFIG } from './ActionCopyMap';
import { Link } from 'react-router-dom';

interface ActionCardProps {
  item: ActionItem;
  compact?: boolean;
  onExecuted?: () => void;
}

export function ActionCard({ item, compact = false, onExecuted }: ActionCardProps) {
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  
  const executeAction = useExecuteActionItem();
  const copy = getActionCopy(item.trigger_type);
  const severityConfig = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.medium;
  const Icon = copy.icon;

  const handleExecute = async () => {
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

  // Use humanized copy if available, otherwise use from map
  const displayTitle = item.humanized?.title || copy.title;
  const displayDescription = item.humanized?.description || item.description || copy.description;
  const displayCta = item.humanized?.cta || copy.cta;

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
          <p className="text-xs text-muted-foreground truncate">
            {item.agent_name || 'Sistema'}
          </p>
        </div>
        <Button size="sm" onClick={handleExecute} disabled={executeAction.isPending}>
          {executeAction.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            displayCta
          )}
        </Button>
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
                'rounded-full p-2.5',
                `${severityConfig.iconClassName.replace('text-', 'bg-')}/20`
              )}>
                <Icon className={cn('h-5 w-5', severityConfig.iconClassName)} />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {displayTitle}
                  <Badge variant="outline" className={severityConfig.className}>
                    {severityConfig.label}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Monitor className="h-3 w-3" />
                  {item.agent_name || 'Sistema'}
                  {item.hostname && ` (${item.hostname})`}
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
          {/* Description */}
          <div className="bg-background/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">{displayDescription}</p>
            {copy.impact && (
              <p className="text-sm mt-2">
                <span className="font-medium">Impacto:</span> {copy.impact}
              </p>
            )}
          </div>

          {/* Context details if available */}
          {item.context && Object.keys(item.context).length > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              {typeof item.context.hours_offline === 'number' && (
                <span>Offline há {item.context.hours_offline}h • </span>
              )}
              {typeof item.context.blocked_requests === 'number' && (
                <span>{item.context.blocked_requests} requisições bloqueadas • </span>
              )}
              {typeof item.context.failure_count === 'number' && (
                <span>{item.context.failure_count} falhas consecutivas</span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              onClick={handleExecute}
              disabled={executeAction.isPending}
              className="flex-1"
            >
              {executeAction.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {displayCta}
            </Button>
            
            {item.source_type === 'playbook' && (
              <Button
                variant="outline"
                onClick={() => setIgnoreDialogOpen(true)}
                disabled={executeAction.isPending}
              >
                <X className="h-4 w-4 mr-2" />
                Ignorar
              </Button>
            )}
            
            {item.source_type === 'alert' && (
              <Button
                variant="outline"
                onClick={handleAcknowledge}
                disabled={executeAction.isPending}
              >
                Reconhecer
              </Button>
            )}

            {item.agent_id && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/agent-health?agent=${item.agent_id}`}>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
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
              Informe o motivo para ignorar esta ação. Isso será registrado para auditoria.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex: Falso positivo - computador em manutenção programada"
            value={ignoreReason}
            onChange={(e) => setIgnoreReason(e.target.value)}
            rows={3}
          />
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
