import { useTaskEvents, TASK_EVENT_LABELS, ACTOR_TYPE_LABELS } from '@/hooks/useTaskEvents';
import { formatBrazil } from '@/lib/date-utils';
import {
  CircleDot, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Ban, 
  UserPlus,
  AlertTriangle,
  Clock,
  Bot,
  User,
  Cpu,
  Loader2
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TaskTimelineProps {
  taskId: string;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case 'created':
      return <CircleDot className="h-4 w-4" />;
    case 'status_changed':
      return <Play className="h-4 w-4" />;
    case 'assigned':
      return <UserPlus className="h-4 w-4" />;
    case 'sla_breached':
      return <Clock className="h-4 w-4 text-destructive" />;
    case 'escalated':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <CircleDot className="h-4 w-4" />;
  }
};

const getActorIcon = (actorType: string) => {
  switch (actorType) {
    case 'ai':
      return <Bot className="h-3 w-3" />;
    case 'human':
      return <User className="h-3 w-3" />;
    case 'system':
    default:
      return <Cpu className="h-3 w-3" />;
  }
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    open: 'Aberta',
    in_progress: 'Em Progresso',
    blocked: 'Bloqueada',
    resolved: 'Resolvida',
    ignored: 'Ignorada',
  };
  return labels[status] || status;
};

export function TaskTimeline({ taskId }: TaskTimelineProps) {
  const { data: events, isLoading } = useTaskEvents(taskId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum evento registrado
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px] pr-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

        <div className="space-y-4">
          {events.map((event) => {
            const metadata = event.metadata as Record<string, unknown> || {};
            
            return (
              <div key={event.id} className="relative flex gap-3 pl-0">
                {/* Icon */}
                <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background border">
                  {getActionIcon(event.action)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {TASK_EVENT_LABELS[event.action] || event.action}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {getActorIcon(event.actor_type)}
                      {ACTOR_TYPE_LABELS[event.actor_type] || event.actor_type}
                    </span>
                  </div>

                  {/* Metadata details */}
                  {event.action === 'status_changed' && metadata.from && metadata.to && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {getStatusLabel(metadata.from as string)} → {getStatusLabel(metadata.to as string)}
                      {metadata.reason && (
                        <span className="block mt-0.5 italic">"{String(metadata.reason)}"</span>
                      )}
                    </p>
                  )}

                  {event.action === 'created' && metadata.severity && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Severidade: {metadata.severity as string} | Origem: {metadata.source_type as string}
                    </p>
                  )}

                  {event.action === 'sla_breached' && metadata.due_at && (
                    <p className="text-xs text-destructive mt-1">
                      Prazo era: {formatBrazil(metadata.due_at as string, "dd/MM HH:mm")}
                    </p>
                  )}

                  {event.action === 'warning' && metadata.message && (
                    <p className="text-xs text-yellow-600 mt-1">
                      {String(metadata.message)}
                    </p>
                  )}

                  {/* Timestamp */}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBrazil(event.created_at, "dd/MM/yyyy 'às' HH:mm:ss")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
