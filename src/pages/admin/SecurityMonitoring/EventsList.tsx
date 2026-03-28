import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Zap, ShieldCheck, Wrench, ShieldAlert, RefreshCw, Ban, Activity, ShieldOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { FilterPill } from './FilterPill';
import type { UnifiedEvent } from './types';
import { severityConfig, eventTypeLabels, alertTypeLabels } from './types';
import React from 'react';

const eventTypeIcons: Record<string, React.ReactNode> = {
  security_event: <ShieldAlert className="h-3.5 w-3.5" />,
  auto_repair: <Wrench className="h-3.5 w-3.5" />,
  auto_recovery: <RefreshCw className="h-3.5 w-3.5" />,
  policy_drift: <ShieldOff className="h-3.5 w-3.5" />,
  state_change: <Activity className="h-3.5 w-3.5" />,
  blocked_access: <Ban className="h-3.5 w-3.5" />,
};

interface EventsListProps {
  filteredEvents: UnifiedEvent[];
  allEventsCount: number;
  categoryCounts: Record<string, number>;
  eventFilter: string;
  onFilterChange: (filter: string) => void;
  onRemediate: (event: { agentName?: string; alertType?: string; label: string }) => void;
  eventsRef: React.RefObject<HTMLDivElement>;
}

export function EventsList({
  filteredEvents,
  allEventsCount,
  categoryCounts,
  eventFilter,
  onFilterChange,
  onRemediate,
  eventsRef,
}: EventsListProps) {
  return (
    <Card className="lg:col-span-2" ref={eventsRef}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Eventos Recentes
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Detecções de segurança em tempo real
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <FilterPill active={eventFilter === 'all'} onClick={() => onFilterChange('all')} count={allEventsCount}>
            Todos
          </FilterPill>
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <FilterPill key={cat} active={eventFilter === cat} onClick={() => onFilterChange(cat)} count={count as number}>
              {{
                security: 'Segurança',
                compliance: 'Conformidade',
                recovery: 'Recuperação',
                system: 'Sistema',
                blocked: 'Bloqueados',
              }[cat] || cat}
            </FilterPill>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filteredEvents.length > 0 ? (
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {filteredEvents.slice(0, 30).map((event) => {
                  const sev = severityConfig[event.severity] || severityConfig.info;
                  const evtMeta = eventTypeLabels[event.type] || eventTypeLabels[event.source === 'blocked_attempts' ? 'blocked_access' : 'security_event'];
                  const evtIcon = eventTypeIcons[event.type] || eventTypeIcons[event.source === 'blocked_attempts' ? 'blocked_access' : 'security_event'];

                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-accent/5 transition-colors group"
                    >
                      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                        <span className={cn("w-2 h-2 rounded-full", sev.dotColor)} />
                        <span className={cn("opacity-60", evtMeta?.color)}>{evtIcon}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {event.label}
                            {event.agentName && (
                              <span className="text-muted-foreground font-normal"> em {event.agentName}</span>
                            )}
                          </p>
                          {event.count > 1 && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                              ×{event.count}
                            </Badge>
                          )}
                        </div>
                        {event.detail && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{event.detail}</p>
                        )}
                        {!event.detail && event.alertType && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Tipo: {alertTypeLabels[event.alertType] || event.alertType}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        <Badge className={cn("text-[9px] px-1.5 py-0 h-4 border-0", sev.badgeBg, sev.badgeText)}>
                          {sev.label}
                        </Badge>
                        {event.remediable && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => onRemediate(event)}
                              >
                                <Wrench className="h-3.5 w-3.5 text-primary" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">Corrigir automaticamente</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-[300px] text-center">
            <ShieldCheck className="h-10 w-10 text-emerald-500/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum evento no período</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Seu ambiente está seguro</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
