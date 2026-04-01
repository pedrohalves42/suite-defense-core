import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { AgentReinstallCommand } from '@/components/agent/AgentReinstallCommand';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Clock, ShieldOff, ShieldAlert, RefreshCw, CheckCircle,
  Flame, Stethoscope, ExternalLink, Activity, Key,
} from 'lucide-react';

interface ActionsTabProps {
  agentId: string;
  agentName: string;
  tenantId?: string;
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
  causality: any;
  agentActions: any;
  firewallSkipData: any;
  firewallSkipLoading: boolean;
  firewallSkipError: boolean;
  effectiveTenantId?: string;
  toggleFirewallSkip: any;
  onViewDiagnostics: () => void;
  onViewTimeline: () => void;
  onAgentDeleted: () => void;
  navigate: (path: string) => void;
}

export const ActionsTab = ({
  agentId, agentName, tenantId,
  isThrottled, isIsolated, isInSafeMode,
  causality, agentActions,
  firewallSkipData, firewallSkipLoading, firewallSkipError,
  effectiveTenantId, toggleFirewallSkip,
  onViewDiagnostics, onViewTimeline, onAgentDeleted, navigate,
}: ActionsTabProps) => (
  <div className="space-y-5">
    {/* Security Actions */}
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segurança</h4>
      <div className="space-y-2">
        {isThrottled && (
          <button onClick={() => agentActions.removeThrottle.mutate(agentId)} disabled={agentActions.removeThrottle.isPending}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left">
            <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Remover Limitação</p>
              <p className="text-xs text-muted-foreground">Remove a limitação temporária de comunicação deste agente.</p>
            </div>
          </button>
        )}
        {isIsolated && (
          <button onClick={() => agentActions.removeIsolation.mutate(agentId)} disabled={agentActions.removeIsolation.isPending}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left">
            <ShieldOff className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Remover Isolamento</p>
              <p className="text-xs text-muted-foreground">Restaura conectividade de rede do agente isolado.</p>
            </div>
          </button>
        )}
        {isInSafeMode && (
          <>
            <button onClick={() => tenantId && agentActions.resetSafeMode.mutate({ agentId, tenantId })} disabled={agentActions.resetSafeMode.isPending}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left">
              <RefreshCw className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Resetar Modo Protegido</p>
                <p className="text-xs text-muted-foreground">Cria uma tarefa para desativar o modo de proteção.</p>
              </div>
            </button>
            <button onClick={() => agentActions.enableOverrideSafeMode.mutate(agentId)} disabled={agentActions.enableOverrideSafeMode.isPending}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left">
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

    {/* Firewall Toggle */}
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configurações do Agente</h4>
      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
        <div className="flex items-start gap-3">
          <Flame className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Desativar remediação de Firewall</p>
            <p className="text-xs text-muted-foreground">
              Impede o agente de reativar o Windows Firewall automaticamente. Use quando há firewall externo (ex: pfSense).
            </p>
            {firewallSkipError && <p className="text-xs text-destructive mt-1">Não foi possível carregar o status salvo agora.</p>}
          </div>
        </div>
        <Switch
          checked={firewallSkipData?.skip_firewall_remediation ?? false}
          onCheckedChange={(checked) => toggleFirewallSkip.mutate(checked)}
          disabled={firewallSkipLoading || firewallSkipError || toggleFirewallSkip.isPending || !agentId || !effectiveTenantId}
        />
      </div>
    </div>

    {/* Navigation */}
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Navegação</h4>
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start h-auto py-3 px-4" onClick={onViewDiagnostics}>
          <Stethoscope className="h-4 w-4 mr-3 text-muted-foreground" />
          <div className="text-left">
            <p className="text-sm font-medium">Diagnóstico Completo</p>
            <p className="text-xs text-muted-foreground">Análise detalhada de saúde e vulnerabilidades</p>
          </div>
          <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
        </Button>
        <Button variant="outline" className="w-full justify-start h-auto py-3 px-4" onClick={() => navigate('/super-admin/enrollment-keys')}>
          <Key className="h-4 w-4 mr-3 text-muted-foreground" />
          <div className="text-left">
            <p className="text-sm font-medium">Chaves de Instalação</p>
            <p className="text-xs text-muted-foreground">Gerenciar chaves para novos agentes</p>
          </div>
          <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
        </Button>
        {causality && causality.stateTransitions.length > 0 && (
          <Button variant="outline" className="w-full justify-start h-auto py-3 px-4" onClick={onViewTimeline}>
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
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manutenção</h4>
      <AgentReinstallCommand agentId={agentId} agentName={agentName} />
    </div>

    {/* Danger Zone */}
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive/70">Zona de Perigo</h4>
      <div className="border border-destructive/20 rounded-lg p-1 bg-destructive/5 space-y-1">
        <TooltipProvider>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 h-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => navigate(`/admin/diagnostics?agent=${agentId}`)}>
            <Stethoscope className="h-4 w-4" />
            <span className="text-sm">Diagnóstico do Computador</span>
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 h-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => navigate('/super-admin/enrollment-keys')}>
            <Key className="h-4 w-4" />
            <span className="text-sm">Nova Chave de Instalação</span>
          </Button>
          <AgentQuickActions agentId={agentId} agentName={agentName} onAgentDeleted={onAgentDeleted} layout="vertical" />
        </TooltipProvider>
      </div>
    </div>
  </div>
);
