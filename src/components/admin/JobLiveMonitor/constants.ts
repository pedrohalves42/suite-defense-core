import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export interface StatusVisual {
  icon: typeof Clock;
  label: string;
  description: string;
  color: string;
  bg: string;
  pulse?: boolean;
  spin?: boolean;
  progress: number;
}

export const STATUS_VISUALS: Record<string, StatusVisual> = {
  queued: { icon: Clock, label: 'Aguardando', description: 'Na fila, aguardando o computador', color: 'text-amber-500', bg: 'bg-amber-500/10', pulse: true, progress: 10 },
  delivered: { icon: Loader2, label: 'Trabalhando...', description: 'Executando no computador agora', color: 'text-blue-500', bg: 'bg-blue-500/10', spin: true, progress: 50 },
  completed: { icon: CheckCircle2, label: 'Pronto!', description: 'Tudo certo, tarefa concluída', color: 'text-green-500', bg: 'bg-green-500/10', progress: 100 },
  failed: { icon: XCircle, label: 'Não deu certo', description: 'Houve um problema', color: 'text-red-500', bg: 'bg-red-500/10', progress: 100 },
  cancelled: { icon: XCircle, label: 'Cancelado', description: 'Tarefa foi cancelada', color: 'text-muted-foreground', bg: 'bg-muted/50', progress: 0 },
};

export function getJobVisual(status: string) {
  return STATUS_VISUALS[status] || STATUS_VISUALS.queued;
}
