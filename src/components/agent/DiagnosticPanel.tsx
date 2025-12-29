/**
 * DiagnosticPanel - Componente modular para diagnóstico de agentes
 * 
 * Modos:
 * - compact: Resumo para uso em drawers (top 3 issues)
 * - full: Visualização completa para página dedicada
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useDiagnostic, 
  getSeverityColor, 
  getSeverityBorderColor,
  getSeverityLabel,
  type DiagnosticIssue 
} from '@/hooks/useDiagnostic';
import { 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Info,
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

const SEVERITY_ICONS = {
  critical: XCircle,
  high: AlertTriangle,
  medium: AlertCircle,
  info: Info,
};

function IssueItem({ issue, compact }: { issue: DiagnosticIssue; compact?: boolean }) {
  const Icon = SEVERITY_ICONS[issue.severity] || AlertCircle;
  
  return (
    <div className={`p-3 rounded-lg border-l-4 bg-card ${getSeverityBorderColor(issue.severity)}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
          issue.severity === 'critical' ? 'text-destructive' :
          issue.severity === 'high' ? 'text-orange-500' :
          issue.severity === 'medium' ? 'text-yellow-500' :
          'text-blue-500'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{issue.description}</span>
            <Badge className={`${getSeverityColor(issue.severity)} text-xs`}>
              {getSeverityLabel(issue.severity)}
            </Badge>
          </div>
          {!compact && issue.details && Object.keys(issue.details).length > 0 && (
            <div className="mt-2">
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(issue.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryBadges({ summary }: { summary: { critical: number; high: number; medium: number; info: number } }) {
  return (
    <div className="flex flex-wrap gap-2">
      {summary.critical > 0 && (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          {summary.critical} crítico{summary.critical > 1 ? 's' : ''}
        </Badge>
      )}
      {summary.high > 0 && (
        <Badge className="bg-orange-500 text-white gap-1">
          <AlertTriangle className="h-3 w-3" />
          {summary.high} alto{summary.high > 1 ? 's' : ''}
        </Badge>
      )}
      {summary.medium > 0 && (
        <Badge className="bg-yellow-500 text-black gap-1">
          <AlertCircle className="h-3 w-3" />
          {summary.medium} médio{summary.medium > 1 ? 's' : ''}
        </Badge>
      )}
      {summary.info > 0 && (
        <Badge className="bg-blue-500 text-white gap-1">
          <Info className="h-3 w-3" />
          {summary.info} info
        </Badge>
      )}
    </div>
  );
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
    const displayIssues = diagnostic.issues.slice(0, 3);
    const remainingCount = diagnostic.issues.length - 3;

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
          <SummaryBadges summary={diagnostic.summary} />
        </div>

        {/* Top issues */}
        <div className="space-y-2">
          {displayIssues.map((issue, idx) => (
            <IssueItem key={idx} issue={issue} compact />
          ))}
          
          {remainingCount > 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              + {remainingCount} problema{remainingCount > 1 ? 's' : ''} adiciona{remainingCount > 1 ? 'is' : 'l'}
            </p>
          )}
        </div>

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
          <SummaryBadges summary={diagnostic.summary} />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {diagnostic.issues.map((issue, idx) => (
              <IssueItem key={idx} issue={issue} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
