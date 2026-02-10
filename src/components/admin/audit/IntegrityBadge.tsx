import { useQuery } from '@tanstack/react-query';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { verifyAuditLogChain } from '@/lib/audit-integrity';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntegrityBadgeProps {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  className?: string;
  loading?: boolean;  // V-504: Guard para sincronização de tenant
}

export function IntegrityBadge({ tenantId, startDate, endDate, className, loading }: IntegrityBadgeProps) {
  const { data: verification, isLoading, error } = useQuery({
    queryKey: ['audit-integrity', tenantId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () => verifyAuditLogChain(tenantId, startDate, endDate),
    enabled: !loading && !!tenantId,  // V-504: Só executar após sincronização
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className={cn("gap-1", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Verificando...
      </Badge>
    );
  }

  if (error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1 text-muted-foreground", className)}>
            <Shield className="h-3 w-3" />
            Erro
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Não foi possível verificar a integridade dos logs
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!verification || verification.total_logs === 0) {
    return (
      <Badge variant="outline" className={cn("gap-1 text-muted-foreground", className)}>
        <Shield className="h-3 w-3" />
        Sem registros
      </Badge>
    );
  }

  if (verification.chain_valid) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn("gap-1 bg-success/10 text-success border-success/30", className)}
          >
            <ShieldCheck className="h-3 w-3" />
            Íntegro
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">Cadeia de integridade válida</p>
            <p className="text-xs text-muted-foreground">
              {verification.total_logs} registros verificados
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={cn("gap-1 bg-destructive/10 text-destructive border-destructive/30", className)}
        >
          <ShieldAlert className="h-3 w-3" />
          Comprometido
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium text-destructive">Integridade comprometida</p>
          <p className="text-xs">
            A cadeia de hashes foi quebrada em{' '}
            {verification.first_broken_at 
              ? formatBrazilDateTime(verification.first_broken_at, 'full')
              : 'data desconhecida'}
          </p>
          <p className="text-xs text-muted-foreground">
            Isso pode indicar alteração ou exclusão de registros.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
