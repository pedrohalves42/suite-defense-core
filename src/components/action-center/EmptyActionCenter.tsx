import { CheckCircle2, Shield, ArrowRight, Monitor, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface EmptyActionCenterProps {
  healthyCount: number;
  offlineCount?: number;
  totalAgents?: number;
  className?: string;
}

export function EmptyActionCenter({ 
  healthyCount, 
  offlineCount = 0, 
  totalAgents = 0,
  className 
}: EmptyActionCenterProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 px-4 text-center',
      'bg-gradient-to-b from-green-500/5 to-transparent rounded-xl border border-green-500/20',
      className
    )}>
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
        <div className="relative rounded-full bg-green-500/10 p-5">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
      </div>
      
      <h2 className="text-xl font-bold text-foreground mb-2">
        Ambiente Protegido
      </h2>
      
      <p className="text-muted-foreground max-w-md mb-6 text-sm">
        Não há ações pendentes. Todos os sistemas estão funcionando normalmente.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        {healthyCount > 0 && (
          <div className="flex items-center gap-2 text-green-600 bg-green-500/10 px-3 py-1.5 rounded-full text-sm">
            <Shield className="h-4 w-4" />
            <span className="font-medium">
              {healthyCount} {healthyCount === 1 ? 'protegido' : 'protegidos'}
            </span>
          </div>
        )}
        {totalAgents > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full text-sm">
            <Monitor className="h-4 w-4" />
            <span>
              {totalAgents} {totalAgents === 1 ? 'computador' : 'computadores'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/agent-health">
            Ver Agentes
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/playbooks">
            Ver Playbooks
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/settings">
            <Settings className="h-4 w-4 mr-1" />
            Configurar
          </Link>
        </Button>
      </div>
    </div>
  );
}
