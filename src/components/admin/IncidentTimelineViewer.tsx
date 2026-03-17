/**
 * Incident Timeline Viewer - Visual Timeline with Causal Connections
 * Fase 4: Narrative incident timeline visualization
 */

import { useState } from 'react';
import { IncidentTimeline, TimelineEvent, INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS, EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from '@/hooks/useIncidentTimeline';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, AlertTriangle, Shield, Activity, CheckCircle, 
  XCircle, ChevronDown, ChevronRight, FileDown, 
  ArrowRight, Link2, Zap, Eye, Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, ptBR } from '@/lib/date-utils';

interface IncidentTimelineViewerProps {
  incident: IncidentTimeline;
  onClose?: () => void;
}

const SEVERITY_COLORS = {
  critical: 'bg-red-500 border-red-600',
  high: 'bg-orange-500 border-orange-600',
  medium: 'bg-yellow-500 border-yellow-600',
  low: 'bg-blue-500 border-blue-600',
  info: 'bg-gray-500 border-gray-600',
};

const SEVERITY_TEXT_COLORS = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-yellow-600',
  low: 'text-blue-600',
  info: 'text-gray-600',
};

export function IncidentTimelineViewer({ incident, onClose }: IncidentTimelineViewerProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showCausalLinks, setShowCausalLinks] = useState(true);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const events = (incident.timeline_events as TimelineEvent[]) || [];
  const causalChains = (incident.causal_chain as { from: string; to: string; relationship: string }[]) || [];

  const getEventIcon = (eventType: string) => {
    const iconName = EVENT_TYPE_ICONS[eventType as keyof typeof EVENT_TYPE_ICONS] || 'circle';
    switch (iconName) {
      case 'alert-triangle': return AlertTriangle;
      case 'shield': return Shield;
      case 'activity': return Activity;
      case 'check-circle': return CheckCircle;
      case 'x-circle': return XCircle;
      case 'zap': return Zap;
      case 'eye': return Eye;
      case 'server': return Server;
      default: return Activity;
    }
  };

  const findCausalLinks = (sourceId: string) => {
    return causalChains.filter(c => c.from === sourceId || c.to === sourceId);
  };

  const handleExportPDF = async () => {
    // TODO: Implement PDF export
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={cn("text-xs", INCIDENT_STATUS_COLORS[incident.status as keyof typeof INCIDENT_STATUS_COLORS] || '')}>
                {INCIDENT_STATUS_LABELS[incident.status as keyof typeof INCIDENT_STATUS_LABELS] || incident.status}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {events.length} eventos
              </Badge>
            </div>
            <CardTitle className="text-base">Incidente #{incident.id.slice(0, 8)}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {format(new Date(incident.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} - {' '}
              {incident.resolved_at 
                ? format(new Date(incident.resolved_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                : 'Em andamento'
              }
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="h-4 w-4 mr-1" />
              PDF
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* AI Narrative */}
        {incident.narrative_summary && (
          <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm text-foreground leading-relaxed">
              {incident.narrative_summary}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setShowCausalLinks(!showCausalLinks)}
          >
            <Link2 className={cn("h-3 w-3 mr-1", showCausalLinks && "text-primary")} />
            {showCausalLinks ? 'Ocultar' : 'Mostrar'} conexões causais
          </Button>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-4">
            {/* Timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

              <AnimatePresence>
                {events.map((event, idx) => {
                  const EventIcon = getEventIcon(event.event_type);
                  const severity = event.severity as keyof typeof SEVERITY_COLORS || 'info';
                  const eventKey = event.source_id || `event-${idx}`;
                  const isExpanded = expandedEvents.has(eventKey);
                  const causalLinks = findCausalLinks(event.source_id);

                  return (
                    <motion.div
                      key={eventKey}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="relative pl-10 pb-6 last:pb-0"
                    >
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        SEVERITY_COLORS[severity] || 'bg-gray-500 border-gray-600'
                      )}>
                        <EventIcon className="h-2.5 w-2.5 text-white" />
                      </div>

                      {/* Causal link indicator */}
                      {showCausalLinks && causalLinks.length > 0 && (
                        <div className="absolute left-7 top-2">
                          <div className="flex items-center gap-0.5">
                            {causalLinks.map((link, linkIdx) => (
                              <div 
                                key={linkIdx}
                                className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
                                title={link.relationship}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      <Collapsible open={isExpanded} onOpenChange={() => toggleEvent(eventKey)}>
                        <CollapsibleTrigger className="w-full text-left">
                          <div className={cn(
                            "p-3 rounded-lg border transition-colors cursor-pointer",
                            isExpanded ? "bg-muted/50 border-primary/30" : "bg-muted/20 hover:bg-muted/40"
                          )}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge 
                                    variant="outline" 
                                    className={cn("text-xs", SEVERITY_TEXT_COLORS[severity])}
                                  >
                                    {EVENT_TYPE_LABELS[event.event_type as keyof typeof EVENT_TYPE_LABELS] || event.event_type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(event.event_time), "HH:mm:ss", { locale: ptBR })}
                                  </span>
                                </div>
                                <p className="text-sm font-medium line-clamp-2">{event.description}</p>
                                <p className="text-xs text-muted-foreground mt-1">{event.title}</p>
                              </div>
                              <ChevronDown className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                                isExpanded && "rotate-180"
                              )} />
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/50 text-sm">
                            {/* Event Details */}
                            {event.data && typeof event.data === 'object' && (
                              <div className="space-y-2">
                                {Object.entries(event.data).map(([key, value]) => (
                                  <div key={key} className="flex items-start gap-2">
                                    <span className="text-xs text-muted-foreground min-w-[100px]">{key}:</span>
                                    <span className="text-xs break-all">
                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Causal Links */}
                            {showCausalLinks && causalLinks.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-border/50">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Conexões Causais</p>
                                <div className="space-y-1">
                                  {causalLinks.map((link, linkIdx) => (
                                    <div key={linkIdx} className="flex items-center gap-2 text-xs">
                                      <ArrowRight className="h-3 w-3 text-primary" />
                                      <span>{link.relationship}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {events.length === 0 && (
                <div className="text-center py-8">
                  <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </CardContent>

      {/* Resolution */}
      {incident.resolution && (
        <>
          <Separator />
          <div className="p-4 bg-green-500/5 shrink-0">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-green-600 mb-1">Resolução</p>
                <p className="text-sm">{incident.resolution}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
