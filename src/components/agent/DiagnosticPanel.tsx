/**
 * DiagnosticPanel - Painel de diagnóstico de agentes
 * Design: Enterprise premium, direto e assertivo
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiagnostic } from '@/hooks/useDiagnostic';
import { DiagnosticSummary } from '@/components/agent/DiagnosticSummary';
import { DiagnosticIssuesList } from '@/components/agent/DiagnosticIssuesList';
import { type DiagnosticIssue } from '@/types/diagnostic';
import { type AgentState } from '@/lib/agent-state-machine';
import { sortIssuesByIntent, type DiagnosticIntent } from '@/lib/diagnostic-actions';
import { 
  ShieldCheck, 
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
  Stethoscope
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

interface DiagnosticPanelProps {
  agentId: string;
  agentName: string;
  tenantId: string;
  agentState?: AgentState | null;
  variant?: 'compact' | 'full';
  intent?: DiagnosticIntent;
  onActionComplete?: () => void;
  onAction?: (actionKey: string, issue: DiagnosticIssue) => void;
}

export function DiagnosticPanel({
  agentId, agentName, tenantId, agentState,
  variant = 'compact', intent = 'overview',
  onActionComplete, onAction,
}: DiagnosticPanelProps) {
  const navigate = useNavigate();
  const { data: diagnostic, isLoading, refetch, isRefetching } = useDiagnostic(agentName, tenantId, agentState);

  const filteredIssues = useMemo(() => {
    if (!diagnostic?.issues) return [];
    let issues = diagnostic.issues;
    if (intent === 'soc') {
      issues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
    }
    return sortIssuesByIntent(issues, intent);
  }, [diagnostic?.issues, intent]);

  const showActions = intent === 'triage' || intent === 'soc';

  const handleViewFullDiagnostic = () => {
    navigate(`/admin/diagnostics?agent=${agentId}`);
  };

  const handleAction = (actionKey: string, issue: DiagnosticIssue) => {
    if (onAction) onAction(actionKey, issue);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  if (!diagnostic) {
    return (
      <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle className="text-sm font-medium">Diagnóstico indisponível</AlertTitle>
        <AlertDescription className="text-xs">
          Não foi possível obter dados de diagnóstico deste computador.
        </AlertDescription>
      </Alert>
    );
  }

  const displayedIssuesCount = filteredIssues.length;

  // Healthy
  if (diagnostic.isHealthy && displayedIssuesCount === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-4 rounded-lg border border-green-500/20 bg-green-500/5">
          <div className="p-1.5 rounded-full bg-green-500/10">
            <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Nenhuma vulnerabilidade detectada
            </p>
            <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
              {intent === 'soc' ? 'Sem ameaças críticas identificadas.' : 'Todos os componentes operando normalmente.'}
            </p>
          </div>
          <Button 
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => refetch()} disabled={isRefetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground px-1">
          Verificado às {new Date(diagnostic.lastCheck).toLocaleTimeString('pt-BR')}
        </p>
      </div>
    );
  }

  // Compact
  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {displayedIssuesCount} {displayedIssuesCount === 1 ? 'problema identificado' : 'problemas identificados'}
            </span>
            {intent === 'soc' && (
              <span className="text-[10px] text-destructive font-medium uppercase tracking-wider">SOC</span>
            )}
          </div>
          <Button 
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => refetch()} disabled={isRefetching}
          >
            <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <DiagnosticSummary summary={diagnostic.summary} compact />

        <DiagnosticIssuesList 
          issues={filteredIssues} compact maxItems={3}
          showRemainingCount showActions={showActions} onAction={handleAction}
        />

        <Button 
          variant="outline" className="w-full h-9 text-xs font-medium gap-2 hover:bg-primary hover:text-primary-foreground transition-colors"
          onClick={handleViewFullDiagnostic}
        >
          Abrir Diagnóstico Completo
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Full
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-foreground" />
              <h3 className="text-base font-semibold tracking-tight">Diagnóstico</h3>
              {intent === 'soc' && (
                <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider bg-destructive/10 px-1.5 py-0.5 rounded">SOC</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {displayedIssuesCount} {displayedIssuesCount === 1 ? 'problema identificado' : 'problemas identificados'}
              {intent === 'soc' ? ' — apenas ameaças críticas' : ''}
            </p>
          </div>
          <Button 
            variant="outline" size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()} disabled={isRefetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <div className="pt-2">
          <DiagnosticSummary summary={diagnostic.summary} />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <DiagnosticIssuesList 
            issues={filteredIssues}
            showActions={showActions} onAction={handleAction}
          />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
