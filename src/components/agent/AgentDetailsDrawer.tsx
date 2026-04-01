/**
 * AgentDetailsDrawer - Drawer lateral para detalhes do agente
 * Orchestrator: delegates to tabs and hook
 */

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentProcessesPanel } from '@/components/agent/AgentProcessesPanel';
import { AgentNetworkPanel } from '@/components/agent/AgentNetworkPanel';
import { DiagnosticPanel } from '@/components/agent/DiagnosticPanel';
import { useAgentDetailsDrawer } from './hooks/useAgentDetailsDrawer';
import { OverviewTab } from './tabs/OverviewTab';
import { ActionsTab } from './tabs/ActionsTab';
import {
  Eye, Activity, Network, Stethoscope, Zap,
  AlertCircle, RefreshCw,
  CheckCircle, AlertTriangle, ShieldAlert, Download, ShieldOff, WifiOff,
} from 'lucide-react';
import { getStateColorClasses, type AgentState } from '@/lib/agent-state-machine';

interface AgentDetailsDrawerProps {
  agentId: string | null;
  agentName?: string;
  tenantId?: string;
  open: boolean;
  onClose: () => void;
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
  onAgentDeleted?: () => void;
}

const STATE_ICONS: Record<AgentState, typeof CheckCircle> = {
  healthy: CheckCircle, degraded: AlertTriangle, safe_mode: ShieldAlert,
  updating: Download, rollback: Download, isolated: ShieldOff,
  offline: WifiOff, quarantined: ShieldOff, shutdown: WifiOff,
};

const STATE_LABELS: Record<AgentState, string> = {
  healthy: 'Saudável', degraded: 'Degradado', safe_mode: 'Modo Protegido',
  updating: 'Atualizando', rollback: 'Rollback', isolated: 'Isolado',
  offline: 'Offline', quarantined: 'Quarentena', shutdown: 'Desligado',
};

export function AgentDetailsDrawer({
  agentId, agentName, tenantId, open, onClose,
  isThrottled, isIsolated, isInSafeMode, onAgentDeleted,
}: AgentDetailsDrawerProps) {
  const hook = useAgentDetailsDrawer(agentId, tenantId);

  const handleAgentDeleted = () => { onClose(); onAgentDeleted?.(); };
  const handleClose = () => { onClose(); };

  const renderStateBadge = () => {
    if (!hook.causality) return null;
    const state = hook.causality.currentState;
    const colors = getStateColorClasses(state);
    const Icon = STATE_ICONS[state];
    return (
      <Badge variant="outline" className={`gap-1.5 ${colors.bg} ${colors.text} ${colors.border}`}>
        <Icon className="h-3 w-3" />
        {STATE_LABELS[state]}
      </Badge>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">
              {agentName || 'Detalhes do Computador'}
            </SheetTitle>
            {renderStateBadge()}
          </div>
          <SheetDescription>
            {hook.causality?.timeInCurrentState && (
              <span>Neste estado há {hook.causality.timeInCurrentState}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {hook.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : hook.isError ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mb-3" />
              <p className="font-medium text-destructive">Erro ao carregar dados</p>
              <p className="text-sm text-muted-foreground mb-4">Não foi possível obter informações deste computador</p>
              <Button variant="outline" onClick={() => hook.refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview" className="text-xs"><Eye className="h-3.5 w-3.5 mr-1" />Geral</TabsTrigger>
                <TabsTrigger value="processes" className="text-xs"><Activity className="h-3.5 w-3.5 mr-1" />Processos</TabsTrigger>
                <TabsTrigger value="network" className="text-xs"><Network className="h-3.5 w-3.5 mr-1" />Rede</TabsTrigger>
                <TabsTrigger value="diagnostic" className="text-xs"><Stethoscope className="h-3.5 w-3.5 mr-1" />Diagnóstico</TabsTrigger>
                <TabsTrigger value="actions" className="text-xs"><Zap className="h-3.5 w-3.5 mr-1" />Ações</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {agentId && (
                  <OverviewTab
                    agentId={agentId}
                    agentName={agentName}
                    tenantId={tenantId}
                    antivirusStatus={hook.antivirusStatus}
                    causality={hook.causality}
                    generatingReport={hook.generatingReport}
                    onGenerateReport={hook.handleGenerateForensicReport}
                    onViewDiagnostics={() => { hook.handleViewDiagnostics(); handleClose(); }}
                    onViewTimeline={() => { hook.handleViewTimeline(); handleClose(); }}
                  />
                )}
              </TabsContent>

              <TabsContent value="processes" className="mt-4">
                {agentId && tenantId ? (
                  <AgentProcessesPanel agentId={agentId} tenantId={tenantId} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Selecione um computador para ver processos</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="network" className="mt-4">
                {agentId ? (
                  <AgentNetworkPanel agentId={agentId} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Selecione um computador para ver informações de rede</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="diagnostic" className="mt-4">
                {agentId && agentName && tenantId ? (
                  <DiagnosticPanel
                    agentId={agentId}
                    agentName={agentName}
                    tenantId={tenantId}
                    agentState={hook.causality?.currentState}
                    variant="compact"
                    intent="overview"
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Selecione um computador para ver o diagnóstico</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="actions" className="mt-4">
                {agentId && agentName && (
                  <ActionsTab
                    agentId={agentId}
                    agentName={agentName}
                    tenantId={tenantId}
                    isThrottled={isThrottled}
                    isIsolated={isIsolated}
                    isInSafeMode={isInSafeMode}
                    causality={hook.causality}
                    agentActions={hook.agentActions}
                    firewallSkipData={hook.firewallSkipData}
                    firewallSkipLoading={hook.firewallSkipLoading}
                    firewallSkipError={hook.firewallSkipError}
                    effectiveTenantId={hook.effectiveTenantId}
                    toggleFirewallSkip={hook.toggleFirewallSkip}
                    onViewDiagnostics={() => { hook.handleViewDiagnostics(); handleClose(); }}
                    onViewTimeline={() => { hook.handleViewTimeline(); handleClose(); }}
                    onAgentDeleted={handleAgentDeleted}
                    navigate={hook.navigate}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
