import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useAgentTimeline } from '@/hooks/useAgentTimeline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Clock, Activity, ChevronDown, Heart, Zap, Shield, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBrazilDateTime } from '@/lib/date-utils';

const getEventIcon = (eventType: string) => {
  switch (eventType.toLowerCase()) {
    case 'heartbeat': return Heart;
    case 'job': return Zap;
    case 'scan': return Shield;
    default: return FileText;
  }
};

const getEventColor = (eventType: string) => {
  switch (eventType.toLowerCase()) {
    case 'heartbeat': return 'text-success';
    case 'job': return 'text-primary';
    case 'scan': return 'text-warning';
    default: return 'text-muted-foreground';
  }
};

export default function AgentTimeline() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  
  const { data: timeline, isLoading, error } = useAgentTimeline(selectedAgent, !!selectedAgent);

  const eventTypes = Array.from(new Set(timeline?.map(e => e.event_type) || []));
  const filteredTimeline = eventTypeFilter === 'all' 
    ? timeline 
    : timeline?.filter(e => e.event_type === eventTypeFilter);

  const toggleItem = (id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AdminPageLayout
      title="Timeline do Agente"
      description="Visualize eventos e atividades do agente"
    >
      <div className="space-y-6">
        {/* Agent Selector */}
        <Card className="border-l-4 border-l-accent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Selecionar Agente
            </CardTitle>
            <CardDescription>Escolha um agente para visualizar timeline</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} />
          </CardContent>
        </Card>

        {selectedAgent && (
          <>
            {/* Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filtrar por Tipo de Evento</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    {eventTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Timeline */}
            {isLoading ? (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Erro ao carregar timeline: {error instanceof Error ? error.message : 'Erro desconhecido'}
                </AlertDescription>
              </Alert>
            ) : filteredTimeline?.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhum evento encontrado para este agente.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3 relative">
                {/* Timeline Line */}
                <div className="absolute left-[30px] top-0 bottom-0 w-0.5 bg-border" />

                {filteredTimeline?.map((event, idx) => {
                  const EventIcon = getEventIcon(event.event_type);
                  const eventId = `${event.source_id}-${event.event_time}`;
                  
                  return (
                    <motion.div
                      key={eventId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Collapsible
                        open={openItems.has(eventId)}
                        onOpenChange={() => toggleItem(eventId)}
                      >
                        <Card className="ml-12 border-l-4 border-l-accent relative">
                          {/* Timeline Dot */}
                          <div className="absolute -left-[62px] top-6 h-8 w-8 rounded-full bg-card border-2 border-border flex items-center justify-center">
                            <EventIcon className={`h-4 w-4 ${getEventColor(event.event_type)}`} />
                          </div>

                          <CollapsibleTrigger className="w-full">
                            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline">{event.event_type}</Badge>
                                  <span className="text-sm font-medium">{event.event_key}</span>
                                </div>
                                <ChevronDown className={`h-4 w-4 transition-transform ${openItems.has(eventId) ? 'rotate-180' : ''}`} />
                              </div>
                              <CardDescription className="text-left text-xs">
                                {formatBrazilDateTime(event.event_time, 'full')}
                              </CardDescription>
                            </CardHeader>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-auto max-h-64">
                                <pre>{JSON.stringify(event.data, null, 2)}</pre>
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
