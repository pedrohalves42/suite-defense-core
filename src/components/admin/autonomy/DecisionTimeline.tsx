import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, CheckCircle, Clock, AlertTriangle, ChevronRight, Monitor } from 'lucide-react';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';

interface DecisionTimelineItem {
  id: string;
  rule_code: string;
  action: string;
  evidence: Record<string, unknown>;
  executed_actions: string[];
  created_at: string;
  agent_id: string | null;
  agent_name: string | null;
  rule_name: string | null;
  rule_severity: string | null;
  risk_level: string | null;
  related_actions: Array<{
    id: string;
    action_type: string;
    status: string;
    executed_at: string | null;
  }> | null;
}

interface DecisionTimelineProps {
  decisions: DecisionTimelineItem[];
  isLoading: boolean;
}

const severityColors: Record<string, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const riskColors: Record<string, string> = {
  none: 'bg-gray-500/10 text-gray-500',
  low: 'bg-green-500/10 text-green-500',
  medium: 'bg-amber-500/10 text-amber-500',
  high: 'bg-red-500/10 text-red-500',
};

const actionStatusIcons: Record<string, typeof CheckCircle> = {
  pending: Clock,
  approved: CheckCircle,
  executed: CheckCircle,
  rejected: AlertTriangle,
};

export function DecisionTimeline({ decisions, isLoading }: DecisionTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Timeline de Decisões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (decisions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Timeline de Decisões
          </CardTitle>
          <CardDescription>Histórico de decisões autônomas do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma decisão registrada ainda</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Timeline de Decisões
        </CardTitle>
        <CardDescription>
          {decisions.length} decisões registradas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {decisions.map((decision, index) => {
              const isExpanded = expandedItems.has(decision.id);
              const StatusIcon = actionStatusIcons[decision.related_actions?.[0]?.status ?? 'pending'] || Clock;

              return (
                <Collapsible
                  key={decision.id}
                  open={isExpanded}
                  onOpenChange={() => toggleItem(decision.id)}
                >
                  <div className="relative flex gap-4">
                    {/* Timeline line */}
                    {index < decisions.length - 1 && (
                      <div className="absolute left-5 top-12 bottom-0 w-px bg-border" />
                    )}

                    {/* Icon */}
                    <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${severityColors[decision.rule_severity ?? 'medium']}`}>
                      <Brain className="h-5 w-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-2">
                      <CollapsibleTrigger className="w-full text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {decision.rule_name || decision.rule_code}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {decision.rule_code}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {decision.action}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {decision.risk_level && (
                              <Badge className={riskColors[decision.risk_level]}>
                                Risco: {decision.risk_level}
                              </Badge>
                            )}
                            <ChevronRight
                              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          {formatDistanceToNow(new Date(decision.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                        {decision.agent_name && (
                          <span className="flex items-center gap-1">
                            <Monitor className="h-3 w-3" />
                            {decision.agent_name}
                          </span>
                        )}
                      </div>

                      <CollapsibleContent>
                        <div className="mt-4 space-y-3 pl-4 border-l-2 border-border">
                          {/* Evidence */}
                          {decision.evidence && Object.keys(decision.evidence).length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                                Evidência
                              </h4>
                              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                                {JSON.stringify(decision.evidence, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Related Actions */}
                          {decision.related_actions && decision.related_actions.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                Ações Relacionadas
                              </h4>
                              <div className="space-y-1">
                                {decision.related_actions.map((action) => {
                                  const ActionIcon = actionStatusIcons[action.status] || Clock;
                                  return (
                                    <div
                                      key={action.id}
                                      className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded"
                                    >
                                      <div className="flex items-center gap-2">
                                        <ActionIcon className="h-3 w-3" />
                                        <span>{action.action_type}</span>
                                      </div>
                                      <Badge variant="outline" className="text-xs">
                                        {action.status}
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Executed Actions */}
                          {decision.executed_actions && decision.executed_actions.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                                Ações Executadas
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {decision.executed_actions.map((action, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {action}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
