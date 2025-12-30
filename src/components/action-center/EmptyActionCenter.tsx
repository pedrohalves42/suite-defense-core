import { CheckCircle2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyActionCenterProps {
  healthyCount: number;
  className?: string;
}

export function EmptyActionCenter({ healthyCount, className }: EmptyActionCenterProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-4 text-center',
      'bg-gradient-to-b from-green-500/5 to-transparent rounded-xl border border-green-500/20',
      className
    )}>
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
        <div className="relative rounded-full bg-green-500/10 p-6">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-foreground mb-2">
        Tudo em ordem!
      </h2>
      
      <p className="text-muted-foreground max-w-md mb-6">
        Não há ações pendentes no momento. Todos os sistemas estão funcionando normalmente.
      </p>

      {healthyCount > 0 && (
        <div className="flex items-center gap-2 text-green-600 bg-green-500/10 px-4 py-2 rounded-full">
          <Shield className="h-4 w-4" />
          <span className="font-medium">
            {healthyCount} {healthyCount === 1 ? 'computador protegido' : 'computadores protegidos'}
          </span>
        </div>
      )}
    </div>
  );
}
