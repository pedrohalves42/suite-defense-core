/**
 * AgentDetailsDrawer - Drawer lateral para detalhes do agente
 * 
 * Container de explicação que mostra:
 * - Informações do sistema (hostname, OS, versão, IP, etc.)
 * - Estado atual com explicação completa
 * - Timeline de transições
 * - Diagnóstico inline
 * - Ações rápidas contextuais
 * - Comando de reinstalação
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';
import { useAgentActions } from '@/hooks/useAgentActions';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { DiagnosticPanel } from '@/components/agent/DiagnosticPanel';
import { AgentProcessesPanel } from '@/components/agent/AgentProcessesPanel';
import { AgentNetworkPanel } from '@/components/agent/AgentNetworkPanel';
import { AgentSystemInfo } from '@/components/agent/AgentSystemInfo';
import { AgentReinstallCommand } from '@/components/agent/AgentReinstallCommand';
import { useAgentCausality } from '@/hooks/useAgentCausality';
import { useAntivirusStatus } from '@/hooks/useAntivirusStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionDivider } from '@/components/ui/section-divider';
import {
  Stethoscope, 
  ExternalLink, 
  CheckCircle, 
  AlertTriangle, 
  ShieldAlert, 
  WifiOff, 
  Download, 
  ShieldOff,
  Eye,
  Activity,
  Network,
  Zap,
  AlertCircle,
  RefreshCw,
  Clock,
  Key
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  healthy: CheckCircle,
  degraded: AlertTriangle,
  safe_mode: ShieldAlert,
  updating: Download,
  rollback: Download,
  isolated: ShieldOff,
  offline: WifiOff,
  quarantined: ShieldOff,
  shutdown: WifiOff
};

const STATE_LABELS: Record<AgentState, string> = {
  healthy: 'Saudável',
  degraded: 'Degradado',
  safe_mode: 'Modo Protegido',
  updating: 'Atualizando',
  rollback: 'Rollback',
  isolated: 'Isolado',
  offline: 'Offline',
  quarantined: 'Quarentena',
  shutdown: 'Desligado'
};

export function AgentDetailsDrawer({
  agentId,
  agentName,
  tenantId,
  open,
  onClose,
  isThrottled,
  isIsolated,
  isInSafeMode,
  onAgentDeleted
}: AgentDetailsDrawerProps) {
  const navigate = useNavigate();
  const { data: causality, isLoading, isError, refetch } = useAgentCausality(agentId, tenantId);
  const { data: antivirusStatus } = useAntivirusStatus(agentId || '', !!agentId);
  const agentActions = useAgentActions();

  const handleAgentDeleted = () => {
    onClose();
    onAgentDeleted?.();
  };

  const handleViewDiagnostics = () => {
    if (agentId) {
      navigate(`/admin/diagnostics?agent=${agentId}`);
      onClose();
    }
  };

  const handleViewTimeline = () => {
    if (agentId) {
      navigate(`/admin/agent-timeline?agent=${agentId}`);
      onClose();
    }
  };

  const renderStateBadge = () => {
    if (!causality) return null;
    const state = causality.currentState;
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
            {causality?.timeInCurrentState && (
              <span>Neste estado há {causality.timeInCurrentState}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mb-3" />
              <p className="font-medium text-destructive">Erro ao carregar dados</p>
              <p className="text-sm text-muted-foreground mb-4">
                Não foi possível obter informações deste computador
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview" className="text-xs">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Geral
                </TabsTrigger>
                <TabsTrigger value="processes" className="text-xs">
                  <Activity className="h-3.5 w-3.5 mr-1" />
                  Processos
                </TabsTrigger>
                <TabsTrigger value="network" className="text-xs">
                  <Network className="h-3.5 w-3.5 mr-1" />
                  Rede
                </TabsTrigger>
                <TabsTrigger value="diagnostic" className="text-xs">
                  <Stethoscope className="h-3.5 w-3.5 mr-1" />
                  Diagnóstico
                </TabsTrigger>
                <TabsTrigger value="actions" className="text-xs">
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  Ações
                </TabsTrigger>
              </TabsList>

              {/* Tab: Visão Geral */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* System Info */}
                {agentId && (
                  <>
                    <SectionDivider label="Informações do Sistema" />
                    <AgentSystemInfo agentId={agentId} tenantId={tenantId} />
                  </>
                )}

                {/* State Explainer */}
                <SectionDivider label="Estado Atual" />
                <AgentStateExplainer agentId={agentId} tenantId={tenantId} />

                {/* Antivirus Status */}
                <SectionDivider label="Antivírus" />
                {antivirusStatus && antivirusStatus.length > 0 ? (
                  <div className="space-y-2">
                    {antivirusStatus.map((av, idx) => (
                      <div key={av.id || idx} className="p-3 rounded-lg bg-muted/30 border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{av.engine_name || 'Antivírus'}</p>
                            <p className="text-xs text-muted-foreground">
                              {av.engine_version || 'Versão desconhecida'}
                            </p>
                          </div>
                          <Badge variant={av.status === 'active' ? 'default' : 'destructive'}>
                            {av.status || 'Desconhecido'}
                          </Badge>
                        </div>
                        {av.last_scan_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Último scan: {new Date(av.last_scan_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                        {(av.threats_found ?? 0) > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-destructive">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{av.threats_found} ameaça(s) detectada(s)</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">AV de terceiros inativo</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Não foi possível detectar nenhum antivírus de terceiros ativo em seu dispositivo. 
                          Para se manter protegido, ative a Segurança do Windows.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Links */}
                <div className="space-y-2 pt-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleViewDiagnostics}
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Ver Diagnóstico Completo
                    <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                  </Button>
                  
                  {causality && causality.stateTransitions.length > 0 && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleViewTimeline}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Timeline Completa
                      <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* Tab: Processos (v5.0+) */}
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

              {/* Tab: Rede */}
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

              {/* Tab: Diagnóstico */}
              <TabsContent value="diagnostic" className="mt-4">
                {agentId && agentName && tenantId ? (
                  <div className="space-y-4">
                    <DiagnosticPanel
                      agentId={agentId}
                      agentName={agentName}
                      tenantId={tenantId}
                      agentState={causality?.currentState}
                      variant="compact"
                      intent="overview"
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Selecione um computador para ver o diagnóstico</p>
                  </div>
                )}
              </TabsContent>

              {/* Tab: Ações */}
              <TabsContent value="actions" className="mt-4">
                {agentId && agentName && (
                  <div className="space-y-5">
                    {/* Security Actions */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Segurança
                      </h4>
                      <div className="space-y-2">
                        {isThrottled && (
                          <button
                            onClick={() => agentActions.removeThrottle.mutate(agentId)}
                            disabled={agentActions.removeThrottle.isPending}
                            className="w-full flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left"
                          >
                            <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium">Remover Limitação</p>
                              <p className="text-xs text-muted-foreground">Remove a limitação temporária de comunicação deste agente.</p>
                            </div>
                          </button>
                        )}
                        {isIsolated && (
                          <button
                            onClick={() => agentActions.removeIsolation.mutate(agentId)}
                            disabled={agentActions.removeIsolation.isPending}
                            className="w-full flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
                          >
                            <ShieldOff className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium">Remover Isolamento</p>
                              <p className="text-xs text-muted-foreground">Restaura conectividade de rede do agente isolado.</p>
                            </div>
                          </button>
                        )}
                        {isInSafeMode && (
                          <>
                            <button
                              onClick={() => tenantId && agentActions.resetSafeMode.mutate({ agentId, tenantId })}
                              disabled={agentActions.resetSafeMode.isPending}
                              className="w-full flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left"
                            >
                              <RefreshCw className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-medium">Resetar Modo Protegido</p>
                                <p className="text-xs text-muted-foreground">Cria uma tarefa para desativar o modo de proteção.</p>
                              </div>
                            </button>
                            <button
                              onClick={() => agentActions.enableOverrideSafeMode.mutate(agentId)}
                              disabled={agentActions.enableOverrideSafeMode.isPending}
                              className="w-full flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
                            >
                              <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-medium">Forçar Atualização (30 min)</p>
                                <p className="text-xs text-muted-foreground">Ignora proteções temporariamente. Use apenas em emergências.</p>
                              </div>
                            </button>
                          </>
                        )}
                        {!isThrottled && !isIsolated && !isInSafeMode && (
                          <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
                            <CheckCircle className="h-4 w-4 text-primary" />
                            <span className="text-sm text-foreground/80">Nenhuma ação de segurança necessária</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Navigation Actions */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Navegação
                      </h4>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-3 px-4"
                          onClick={handleViewDiagnostics}
                        >
                          <Stethoscope className="h-4 w-4 mr-3 text-muted-foreground" />
                          <div className="text-left">
                            <p className="text-sm font-medium">Diagnóstico Completo</p>
                            <p className="text-xs text-muted-foreground">Análise detalhada de saúde e vulnerabilidades</p>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-3 px-4"
                          onClick={() => navigate('/admin/enrollment-keys')}
                        >
                          <Key className="h-4 w-4 mr-3 text-muted-foreground" />
                          <div className="text-left">
                            <p className="text-sm font-medium">Chaves de Instalação</p>
                            <p className="text-xs text-muted-foreground">Gerenciar chaves para novos agentes</p>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
                        </Button>
                        {causality && causality.stateTransitions.length > 0 && (
                          <Button
                            variant="outline"
                            className="w-full justify-start h-auto py-3 px-4"
                            onClick={handleViewTimeline}
                          >
                            <Activity className="h-4 w-4 mr-3 text-muted-foreground" />
                            <div className="text-left">
                              <p className="text-sm font-medium">Timeline de Eventos</p>
                              <p className="text-xs text-muted-foreground">Histórico de transições de estado</p>
                            </div>
                            <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Reinstall */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Manutenção
                      </h4>
                      <AgentReinstallCommand 
                        agentId={agentId} 
                        agentName={agentName} 
                      />
                    </div>

                    {/* Danger Zone */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive/70">
                        Zona de Perigo
                      </h4>
                      <div className="border border-destructive/20 rounded-lg p-3 space-y-2 bg-destructive/5">
                        <TooltipProvider>
                          <AgentQuickActions
                            agentId={agentId}
                            agentName={agentName}
                            onAgentDeleted={handleAgentDeleted}
                          />
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}