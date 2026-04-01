import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, ShieldCheck, Monitor, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { HelpTip } from './HelpTip';
import { type SecurityEvent } from '../security-event-utils';

interface SecurityEventFeedProps {
  events: SecurityEvent[];
  isLive: boolean;
}

export function SecurityEventFeed({ events, isLive }: SecurityEventFeedProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              O que aconteceu recentemente
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cada linha é algo que o sistema detectou e tratou
              <HelpTip text="Sempre que algo suspeito acontece, o sistema registra aqui. Vermelho = urgente, Amarelo = atenção, Azul = informativo." />
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px] pr-2">
          <AnimatePresence mode="popLayout">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-14 w-14 text-success/60 mb-4" />
                <p className="text-sm font-semibold">Tudo tranquilo! 🎉</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  Nenhuma atividade suspeita foi detectada. Seus computadores estão seguros.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event, idx) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.02 }}
                  >
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            "p-3 rounded-lg border-l-4 cursor-default transition-colors",
                            event.severity === 'critical' && "border-l-destructive bg-destructive/5",
                            event.severity === 'warning' && "border-l-warning bg-warning/5",
                            !['critical', 'warning'].includes(event.severity) && "border-l-primary/50 bg-primary/5",
                          )}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span className="text-base leading-none mt-0.5">{event.icon}</span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium leading-tight">{event.title}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {event.computer && (
                                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Monitor className="h-3 w-3" /> {event.computer}
                                      </span>
                                    )}
                                    {event.ip && (
                                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Wifi className="h-3 w-3" /> {event.ip}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: ptBR })}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[300px] text-xs p-3">
                          <p className="font-medium mb-1">💡 O que significa?</p>
                          <p>{event.explanation}</p>
                          {event.extra && <p className="mt-1 text-muted-foreground">{event.extra}</p>}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
