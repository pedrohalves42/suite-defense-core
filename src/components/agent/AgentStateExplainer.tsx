/**
 * Componente que explica o estado atual do agente
 * 
 * Responde: Por quê está assim? Quando aconteceu? O que fazer?
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle, 
  AlertTriangle, 
  ShieldAlert, 
  Download, 
  RotateCcw, 
  ShieldOff, 
  WifiOff, 
  AlertOctagon,
  Clock,
  User,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  History
} from 'lucide-react';
import { useAgentCausality, CausalEvent, StateTransition } from '@/hooks/useAgentCausality';
import { AgentState, getStateColorClasses } from '@/lib/agent-state-machine';
import { formatRelativeTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';

const STATE_ICONS: Record<AgentState, typeof CheckCircle> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  safe_mode: ShieldAlert,
  updating: Download,
  rollback: RotateCcw,
  isolated: ShieldOff,
  offline: WifiOff,
  quarantined: AlertOctagon,
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

interface AgentStateExplainerProps {
  agentId: string | null;
  compact?: boolean;
}

export function AgentStateExplainer({ agentId, compact = false }: AgentStateExplainerProps) {
  const { data: causality, isLoading, error } = useAgentCausality(agentId);
  const [showAllTransitions, setShowAllTransitions] = useState(false);

  if (!agentId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Diferenciar erro técnico de agente não encontrado
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertOctagon className="h-4 w-4" />
        <AlertTitle>Erro ao carregar estado</AlertTitle>
        <AlertDescription>
          Falha técnica ao consultar os dados. Tente novamente em instantes.
        </AlertDescription>
      </Alert>
    );
  }

  if (!causality) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Computador não visível</AlertTitle>
        <AlertDescription>
          Este computador não está visível no contexto atual. Verifique se você está na empresa correta e atualize a página.
        </AlertDescription>
      </Alert>
    );
  }

  const StateIcon = STATE_ICONS[causality.currentState];
  const colors = getStateColorClasses(causality.currentState);

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
        <StateIcon className={`h-5 w-5 ${colors.text}`} />
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${colors.text}`}>{causality.reason}</p>
          {causality.formattedStateSince && (
            <p className="text-xs text-muted-foreground">
              {causality.formattedStateSince}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Transições a mostrar: primeiras 3 por padrão
  const visibleTransitions = showAllTransitions 
    ? causality.stateTransitions 
    : causality.stateTransitions.slice(0, 3);

  return (
    <Card className={`border-l-4 ${colors.border}`}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <StateIcon className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div>
            <CardTitle className="text-lg">Por que este estado?</CardTitle>
            <CardDescription>{causality.stateDescription}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Explicação principal */}
        <div className={`p-4 rounded-lg ${colors.bg} border ${colors.border}`}>
          <div className="flex items-start gap-3">
            <Zap className={`h-4 w-4 mt-0.5 ${colors.text}`} />
            <div className="flex-1">
              <p className="font-medium">{causality.reason}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {causality.causedBy}
                </span>
                {causality.formattedStateSince && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {causality.formattedStateSince}
                  </span>
                )}
                {causality.timeInCurrentState && (
                  <span className="flex items-center gap-1 text-primary">
                    <History className="h-3 w-3" />
                    {causality.timeInCurrentState}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Override ativo */}
        {causality.overrideExpiresAt && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>Atualização forçada ativa</AlertTitle>
            <AlertDescription>
              Override expira {formatRelativeTime(causality.overrideExpiresAt)}
            </AlertDescription>
          </Alert>
        )}

        {/* Próximos passos */}
        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
          <ArrowRight className="h-4 w-4 mt-0.5 text-primary" />
          <div>
            <p className="text-sm font-medium">O que fazer agora?</p>
            <p className="text-sm text-muted-foreground">{causality.nextSteps}</p>
          </div>
        </div>

        {/* Timeline de transições de estado (colapsável) */}
        {causality.stateTransitions.length > 0 && (
          <Collapsible open={showAllTransitions} onOpenChange={setShowAllTransitions}>
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Histórico de Estados
                </h4>
                {causality.stateTransitions.length > 3 && (
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      {showAllTransitions ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Menos
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Ver mais ({causality.stateTransitions.length - 3})
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                )}
              </div>
              
              <div className="space-y-2">
                {visibleTransitions.slice(0, 3).map((transition, idx) => (
                  <StateTransitionItem key={`${transition.timestamp}-${idx}`} transition={transition} index={idx} />
                ))}
              </div>
              
              <CollapsibleContent>
                <div className="space-y-2 mt-2">
                  {visibleTransitions.slice(3).map((transition, idx) => (
                    <StateTransitionItem key={`${transition.timestamp}-${idx + 3}`} transition={transition} index={idx + 3} />
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}

        {/* Timeline de eventos causais */}
        {causality.events.length > 0 && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Eventos recentes
            </h4>
            <div className="space-y-2">
              {causality.events.slice(0, 5).map((event, idx) => (
                <CausalEventItem key={event.id} event={event} index={idx} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StateTransitionItem({ transition, index }: { transition: StateTransition; index: number }) {
  const fromColors = getStateColorClasses(transition.fromState);
  const toColors = getStateColorClasses(transition.toState);
  const FromIcon = STATE_ICONS[transition.fromState];
  const ToIcon = STATE_ICONS[transition.toState];

  const getTriggeredByLabel = (triggeredBy: StateTransition['triggeredBy']) => {
    switch (triggeredBy) {
      case 'rule': return 'Regra automática';
      case 'manual': return 'Ação manual';
      case 'system': return 'Sistema';
      default: return triggeredBy;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
    >
      {/* Estado anterior */}
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${fromColors.bg} ${fromColors.text}`}>
        <FromIcon className="h-3 w-3" />
        <span className="text-xs">{STATE_LABELS[transition.fromState]}</span>
      </div>
      
      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      
      {/* Estado novo */}
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${toColors.bg} ${toColors.text}`}>
        <ToIcon className="h-3 w-3" />
        <span className="text-xs">{STATE_LABELS[transition.toState]}</span>
      </div>
      
      {/* Meta info */}
      <div className="flex-1 text-right text-xs text-muted-foreground">
        <span>{transition.formattedTime}</span>
        {transition.duration && (
          <span className="ml-2 text-primary">({transition.duration})</span>
        )}
      </div>
    </motion.div>
  );
}

function CausalEventItem({ event, index }: { event: CausalEvent; index: number }) {
  const getEventColor = (type: CausalEvent['type']) => {
    switch (type) {
      case 'decision': return 'bg-primary/10 text-primary border-primary/30';
      case 'rollback': return 'bg-warning/10 text-warning border-warning/30';
      case 'safe_mode': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'isolation': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'update': return 'bg-success/10 text-success border-success/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <Badge variant="outline" className={`text-xs ${getEventColor(event.type)}`}>
        {event.type}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{event.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{event.formattedTime}</span>
          {event.actor && (
            <>
              <span>•</span>
              <span>{event.actor}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}