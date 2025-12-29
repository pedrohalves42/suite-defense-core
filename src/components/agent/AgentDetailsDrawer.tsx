/**
 * AgentDetailsDrawer - Drawer lateral para detalhes do agente
 * 
 * Container de explicação que mostra:
 * - Estado atual com explicação completa
 * - Timeline de transições
 * - Ações rápidas contextuais
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { useAgentCausality } from '@/hooks/useAgentCausality';
import { Skeleton } from '@/components/ui/skeleton';
import { Stethoscope, ExternalLink, CheckCircle, AlertTriangle, ShieldAlert, WifiOff, Download, ShieldOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getStateColorClasses, type AgentState } from '@/lib/agent-state-machine';

interface AgentDetailsDrawerProps {
  agentId: string | null;
  agentName?: string;
  open: boolean;
  onClose: () => void;
  // Props opcionais para ações (passados do pai que já tem os dados)
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
}

const STATE_ICONS: Record<AgentState, typeof CheckCircle> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  safe_mode: ShieldAlert,
  updating: Download,
  rollback: Download,
  isolated: ShieldOff,
  offline: WifiOff,
  quarantined: ShieldOff
};

const STATE_LABELS: Record<AgentState, string> = {
  healthy: 'Saudável',
  degraded: 'Degradado',
  safe_mode: 'Modo Protegido',
  updating: 'Atualizando',
  rollback: 'Rollback',
  isolated: 'Isolado',
  offline: 'Offline',
  quarantined: 'Quarentena'
};

export function AgentDetailsDrawer({
  agentId,
  agentName,
  open,
  onClose,
  isThrottled,
  isIsolated,
  isInSafeMode
}: AgentDetailsDrawerProps) {
  const navigate = useNavigate();
  const { data: causality, isLoading } = useAgentCausality(agentId);

  const hasSpecialStatus = isThrottled || isIsolated || isInSafeMode;

  const handleViewDiagnostics = () => {
    if (agentId) {
      navigate(`/admin/agent-diagnostics?agent=${agentId}`);
      onClose();
    }
  };

  const handleViewTimeline = () => {
    if (agentId) {
      navigate(`/admin/agent-timeline?agent=${agentId}`);
      onClose();
    }
  };

  // Render state badge
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

        <div className="mt-6 space-y-6">
          {/* Explicador de Estado Completo */}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <AgentStateExplainer agentId={agentId} />
          )}

          <Separator />

          {/* Ações Rápidas */}
          {agentId && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Ações Rápidas</h4>
              <TooltipProvider>
                <div className="flex flex-wrap gap-2">
                  <AgentQuickActions
                    agentId={agentId}
                    agentName={agentName || 'Computador'}
                    isThrottled={isThrottled}
                    isIsolated={isIsolated}
                    isInSafeMode={isInSafeMode}
                  />
                </div>
              </TooltipProvider>
            </div>
          )}

          <Separator />

          {/* Links para Mais Detalhes */}
          <div className="space-y-2">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}