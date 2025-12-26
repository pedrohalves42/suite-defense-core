import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Loader2, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobStatusSimplifiedProps {
  status: string;
  errorMessage?: string | null;
  className?: string;
}

// Helper to determine if a failure was due to timeout/offline
function isTimeoutFailure(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  const timeoutPatterns = [
    'Auto-cleanup',
    'Timeout:',
    'timeout',
    'exceeded',
    'expired',
    'offline',
    'queued job exceeded'
  ];
  return timeoutPatterns.some(pattern => 
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
}

// Get humanized status info
export function getJobStatusInfo(status: string, errorMessage?: string | null) {
  switch (status) {
    case 'completed':
      return {
        label: 'Concluído',
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        description: 'Tarefa executada com sucesso'
      };
    case 'failed':
      if (isTimeoutFailure(errorMessage)) {
        return {
          label: 'Expirou',
          icon: Clock,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/30',
          description: 'Computador estava desligado'
        };
      }
      return {
        label: 'Erro',
        icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        description: 'Tarefa falhou'
      };
    case 'delivered':
      return {
        label: 'Em andamento',
        icon: Loader2,
        color: 'text-blue-600',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        description: 'Executando no computador'
      };
    case 'queued':
      return {
        label: 'Aguardando',
        icon: Clock,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        description: 'Na fila de execução'
      };
    case 'cancelled':
      return {
        label: 'Cancelado',
        icon: Ban,
        color: 'text-gray-500',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/30',
        description: 'Tarefa cancelada'
      };
    default:
      return {
        label: status,
        icon: Clock,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
        borderColor: 'border-border',
        description: ''
      };
  }
}

// Calculate REAL success rate excluding timeouts
export function calculateRealSuccessRate(jobs: Array<{ status: string; error_message?: string | null }>) {
  const completed = jobs.filter(j => j.status === 'completed').length;
  const realFailed = jobs.filter(j => 
    j.status === 'failed' && !isTimeoutFailure(j.error_message)
  ).length;
  const timeoutFailed = jobs.filter(j => 
    j.status === 'failed' && isTimeoutFailure(j.error_message)
  ).length;
  
  const relevantTotal = completed + realFailed;
  const rate = relevantTotal > 0 ? Math.round((completed / relevantTotal) * 100) : 100;
  
  return {
    rate,
    completed,
    realFailed,
    timeoutFailed,
    total: jobs.length
  };
}

export function JobStatusSimplified({ status, errorMessage, className }: JobStatusSimplifiedProps) {
  const info = getJobStatusInfo(status, errorMessage);
  const Icon = info.icon;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        info.bgColor, 
        info.borderColor, 
        info.color,
        'gap-1',
        className
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'delivered' && 'animate-spin')} />
      {info.label}
    </Badge>
  );
}
