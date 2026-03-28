import type { RpcAgentRow } from '@/types/rpc';
import type { AgentState } from '@/lib/agent-state-machine';
import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DiagnosticPanel } from '@/components/agent/DiagnosticPanel';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { getStateColorClasses } from '@/lib/agent-state-machine';
import { Activity, AlertCircle, Shield, FileText, Wrench, Computer } from 'lucide-react';
import { TroubleshootingGuides } from './TroubleshootingGuides';
import { RemoteToolsGrid } from './RemoteToolsGrid';
import type { ProblematicAgent } from './types';

interface AgentDetailPanelProps {
  selectedAgent: RpcAgentRow | null;
  selectedAgentId: string | null;
  selectedAgentState: AgentState | null;
  socMode: boolean;
  tenantId: string | undefined;
  problematicAgents: ProblematicAgent[];
  queryClient: QueryClient;
  navigate: NavigateFunction;
  onCleanupAgent: (agent: ProblematicAgent) => void;
  onBulkCleanup: () => void;
  onDownloadReinstallScript: () => void;
}

export function AgentDetailPanel({
  selectedAgent,
  selectedAgentId,
  selectedAgentState,
  socMode,
  tenantId,
  problematicAgents,
  queryClient,
  navigate,
  onCleanupAgent,
  onBulkCleanup,
  onDownloadReinstallScript,
}: AgentDetailPanelProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {selectedAgent ? selectedAgent.agent_name : 'Selecione um computador'}
            </CardTitle>
            {selectedAgent && (
              <CardDescription>
                {selectedAgent.hostname} • {selectedAgent.os_type || 'SO desconhecido'}
              </CardDescription>
            )}
          </div>
          {selectedAgent && selectedAgentState && (
            <Badge variant="outline" className={`${getStateColorClasses(selectedAgentState).bg} ${getStateColorClasses(selectedAgentState).text}`}>
              {selectedAgentState}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!selectedAgent ? (
          <div className="text-center py-12 text-muted-foreground">
            <Computer className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Selecione um computador na lista para ver o diagnóstico</p>
          </div>
        ) : (
          <Tabs defaultValue="diagnostic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="diagnostic" className="text-xs">
                <AlertCircle className="h-3.5 w-3.5 mr-1" />
                Diagnóstico
              </TabsTrigger>
              <TabsTrigger value="state" className="text-xs">
                <Shield className="h-3.5 w-3.5 mr-1" />
                Estado
              </TabsTrigger>
              <TabsTrigger value="guides" className="text-xs">
                <FileText className="h-3.5 w-3.5 mr-1" />
                Guias
              </TabsTrigger>
              <TabsTrigger value="tools" className="text-xs">
                <Wrench className="h-3.5 w-3.5 mr-1" />
                Ferramentas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="diagnostic" className="mt-4">
              <DiagnosticPanel
                agentId={selectedAgent.id}
                agentName={selectedAgent.agent_name}
                tenantId={selectedAgent.tenant_id}
                agentState={selectedAgentState}
                variant="full"
                intent={socMode ? 'soc' : 'triage'}
              />
            </TabsContent>

            <TabsContent value="state" className="mt-4 space-y-4">
              <AgentStateExplainer agentId={selectedAgent.id} tenantId={selectedAgent.tenant_id} />
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Ações Rápidas</h4>
                <TooltipProvider>
                  <AgentQuickActions
                    agentId={selectedAgent.id}
                    agentName={selectedAgent.agent_name}
                    isThrottled={selectedAgent.is_throttled}
                    isIsolated={selectedAgent.is_isolated}
                    isInSafeMode={!!selectedAgent.safe_mode_entered_at}
                  />
                </TooltipProvider>
              </div>
            </TabsContent>

            <TabsContent value="guides" className="mt-4">
              <TroubleshootingGuides />
            </TabsContent>

            <TabsContent value="tools" className="mt-4 space-y-4">
              {tenantId && (
                <RemoteToolsGrid
                  selectedAgent={selectedAgent}
                  selectedAgentId={selectedAgentId}
                  tenantId={tenantId}
                  problematicAgents={problematicAgents}
                  queryClient={queryClient}
                  navigate={navigate}
                  onCleanupAgent={onCleanupAgent}
                  onBulkCleanup={onBulkCleanup}
                  onDownloadReinstallScript={onDownloadReinstallScript}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
