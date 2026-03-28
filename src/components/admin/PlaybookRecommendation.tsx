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
  AlertTriangle,
  Play,
  X,
  Clock,
  Shield,
  Zap,
  FileText,
  Bell,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { 
  PlaybookExecution,
  PlaybookAction,
  useExecutePlaybook, 
  useIgnorePlaybookExecution 
} from '@/hooks/usePlaybooks';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface PlaybookRecommendationProps {
  execution: PlaybookExecution;
  onExecuted?: () => void;
}

const ACTION_ICONS: Record<string, typeof Bell> = {
  notify: Bell,
  isolate: Lock,
  generate_report: FileText,
  create_job: Zap,
  revoke_token: Shield,
  escalate: AlertCircle,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const RISK_COLORS: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

export function PlaybookRecommendation({ execution, onExecuted }: PlaybookRecommendationProps) {
  const [expanded, setExpanded] = useState(false);
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [executingAction, setExecutingAction] = useState<number | null>(null);

  const executePlaybook = useExecutePlaybook();
  const ignoreExecution = useIgnorePlaybookExecution();

  const playbook = execution.playbook;
  const agent = execution.agent;
  const context = execution.trigger_context as Record<string, unknown> || {};
  const agentInfo = context.agent_info as Record<string, unknown> || {};

  // ✅ CRÍTICO: Usar actions_snapshot imutável se disponível (auditabilidade)
  const actionsSnapshot = (execution as unknown as Record<string, unknown>).actions_snapshot as PlaybookAction[] | undefined;
  const actions = actionsSnapshot?.length 
    ? [...actionsSnapshot].sort((a, b) => a.order_index - b.order_index)
    : playbook?.actions?.sort((a, b) => a.order_index - b.order_index) || [];

  const handleExecuteAll = async () => {
    await executePlaybook.mutateAsync({ executionId: execution.id });
    onExecuted?.();
  };

  const handleExecuteAction = async (actionIndex: number) => {
    setExecutingAction(actionIndex);
    try {
      await executePlaybook.mutateAsync({ 
        executionId: execution.id, 
        actionIndex 
      });
      onExecuted?.();
    } finally {
      setExecutingAction(null);
    }
  };

  const handleIgnore = async () => {
    if (!ignoreReason.trim()) return;
    await ignoreExecution.mutateAsync({ 
      executionId: execution.id, 
      reason: ignoreReason 
    });
    setIgnoreDialogOpen(false);
    onExecuted?.();
  };

  if (!playbook) return null;

  return (
    <>
      <Card className={cn(
        'border-l-4 transition-all',
        playbook.severity === 'critical' && 'border-l-red-500 bg-red-500/5',
        playbook.severity === 'high' && 'border-l-orange-500 bg-orange-500/5',
        playbook.severity === 'medium' && 'border-l-yellow-500 bg-yellow-500/5',
        playbook.severity === 'low' && 'border-l-blue-500 bg-blue-500/5',
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'rounded-full p-2',
                playbook.severity === 'critical' && 'bg-red-500/20',
                playbook.severity === 'high' && 'bg-orange-500/20',
                playbook.severity === 'medium' && 'bg-yellow-500/20',
                playbook.severity === 'low' && 'bg-blue-500/20',
              )}>
                <AlertTriangle className={cn(
                  'h-5 w-5',
                  playbook.severity === 'critical' && 'text-red-500',
                  playbook.severity === 'high' && 'text-orange-500',
                  playbook.severity === 'medium' && 'text-yellow-500',
                  playbook.severity === 'low' && 'text-blue-500',
                )} />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {playbook.name}
                  <Badge variant="outline" className={SEVERITY_COLORS[playbook.severity]}>
                    {playbook.severity}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  {agent?.agent_name || agentInfo?.agent_name as string || 'Sistema'} 
                  {agent?.hostname && ` (${agent.hostname})`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(execution.triggered_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* Contexto/Interpretação */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              {playbook.description}
            </p>
            {Object.keys(context).length > 0 && context.hours_offline && (
              <p className="text-sm mt-2">
                <span className="font-medium">Detalhes:</span>{' '}
                {context.hours_offline && `Offline há ${context.hours_offline}h`}
                {context.blocked_requests && `${context.blocked_requests} requisições bloqueadas`}
                {context.failure_count && `${context.failure_count} falhas consecutivas`}
              </p>
            )}
          </div>

          {/* Ações Recomendadas */}
          <div className="space-y-2">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpanded(!expanded)}
            >
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Ações Recomendadas ({actions.length})
              </h4>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {expanded && (
              <div className="space-y-2 mt-2">
                {actions.map((action, index) => {
                  const Icon = ACTION_ICONS[action.action_type] || Zap;
                  const isExecuting = executingAction === index;

                  return (
                    <div 
                      key={action.id}
                      className="flex items-center justify-between p-3 bg-background rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          {index + 1}
                        </div>
                        <Icon className={cn('h-4 w-4', RISK_COLORS[action.risk_level])} />
                        <div>
                          <p className="text-sm font-medium">{action.label}</p>
                          {action.description && (
                            <p className="text-xs text-muted-foreground">{action.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExecuteAction(index)}
                        disabled={isExecuting || executePlaybook.isPending}
                      >
                        {isExecuting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Executar
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botões de Ação Principal */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              onClick={handleExecuteAll}
              disabled={executePlaybook.isPending}
              className="flex-1"
            >
              {executePlaybook.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Executar Todas
            </Button>
            <Button
              variant="outline"
              onClick={() => setIgnoreDialogOpen(true)}
              disabled={ignoreExecution.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Ignorar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog para Ignorar */}
      <Dialog open={ignoreDialogOpen} onOpenChange={setIgnoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ignorar Recomendação</DialogTitle>
            <DialogDescription>
              Informe o motivo para ignorar esta recomendação. Isso será registrado para auditoria.
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
              disabled={!ignoreReason.trim() || ignoreExecution.isPending}
            >
              {ignoreExecution.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
