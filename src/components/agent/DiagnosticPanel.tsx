/**
 * DiagnosticPanel - Orquestrador modular para diagnóstico de agentes
 * 
 * Compõe:
 * - DiagnosticSummary (badges)
 * - DiagnosticIssuesList (lista de problemas)
 * 
 * Modos:
 * - compact: Resumo para uso em drawers (top 3 issues)
 * - full: Visualização completa para página dedicada
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiagnostic } from '@/hooks/useDiagnostic';
import { DiagnosticSummary } from '@/components/agent/DiagnosticSummary';
import { DiagnosticIssuesList } from '@/components/agent/DiagnosticIssuesList';
import { 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  ExternalLink,
  Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DiagnosticPanelProps {
  agentId: string;
  agentName: string;
  tenantId: string;
  variant?: 'compact' | 'full';
  onActionComplete?: () => void;
}

export function DiagnosticPanel({
  agentId,
  agentName,
  tenantId,
  variant = 'compact',
  onActionComplete,
}: DiagnosticPanelProps) {
  const navigate = useNavigate();
  const { data: diagnostic, isLoading, refetch, isRefetching } = useDiagnostic(agentName, tenantId);

  const handleViewFullDiagnostic = () => {
    navigate(`/admin/diagnostics?agent=${agentId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // No data
  if (!diagnostic) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Diagnóstico indisponível</AlertTitle>
        <AlertDescription>
          Não foi possível carregar o diagnóstico para este computador.
        </AlertDescription>
      </Alert>
    );
  }

  // Healthy state
  if (diagnostic.isHealthy && diagnostic.issues.length === 0) {
    return (
      <div className="space-y-4">
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-700 dark:text-green-400">Sistema Saudável</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-300">
            Nenhum problema detectado neste computador.
          </AlertDescription>
        </Alert>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Última verificação: {new Date(diagnostic.lastCheck).toLocaleTimeString('pt-BR')}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1">Atualizar</span>
          </Button>
        </div>
      </div>
    );
  }

  // Compact mode - show summary and top 3 issues
  if (variant === 'compact') {
    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {diagnostic.summary.total} problema{diagnostic.summary.total > 1 ? 's' : ''} detectado{diagnostic.summary.total > 1 ? 's' : ''}
            </h4>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              {isRefetching ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
          <DiagnosticSummary summary={diagnostic.summary} />
        </div>

        {/* Top issues */}
        <DiagnosticIssuesList 
          issues={diagnostic.issues} 
          compact 
          maxItems={3}
          showRemainingCount
        />

        {/* Action button */}
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={handleViewFullDiagnostic}
        >
          Ver Diagnóstico Completo
          <ExternalLink className="h-3 w-3 ml-2" />
        </Button>
      </div>
    );
  }

  // Full mode - show all issues with details
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Diagnóstico Completo
            </CardTitle>
            <CardDescription>
              {diagnostic.summary.total} problema{diagnostic.summary.total > 1 ? 's' : ''} detectado{diagnostic.summary.total > 1 ? 's' : ''}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
        <div className="pt-2">
          <DiagnosticSummary summary={diagnostic.summary} />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <DiagnosticIssuesList issues={diagnostic.issues} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
