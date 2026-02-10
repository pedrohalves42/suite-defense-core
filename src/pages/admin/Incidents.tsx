/**
 * Incidents Page - Incident Timeline Management
 * Fase 4: Full incident management with timeline reconstruction
 */

import { useState } from 'react';
import { useIncidentTimelines, useReconstructTimeline, useUpdateIncidentStatus, INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS } from '@/hooks/useIncidentTimeline';
import { IncidentTimelineViewer } from '@/components/admin/IncidentTimelineViewer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { 
  AlertTriangle, Clock, Search, RefreshCw, Plus, 
  Calendar as CalendarIcon, Filter, ChevronRight, Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { subHours } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { IncidentTimeline } from '@/hooks/useIncidentTimeline';

export default function Incidents() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<IncidentTimeline | null>(null);
  const [isReconstructDialogOpen, setIsReconstructDialogOpen] = useState(false);
  const [reconstructAgentId, setReconstructAgentId] = useState('');
  const [reconstructDateRange, setReconstructDateRange] = useState<DateRange | undefined>({
    from: subHours(new Date(), 24),
    to: new Date(),
  });

  const { data: incidents, isLoading } = useIncidentTimelines(statusFilter === 'all' ? undefined : statusFilter);
  const reconstructTimeline = useReconstructTimeline();

  const handleReconstruct = async () => {
    if (!reconstructAgentId || !reconstructDateRange?.from || !reconstructDateRange?.to) return;

    await reconstructTimeline.mutateAsync({
      agentId: reconstructAgentId,
      startTime: reconstructDateRange.from.toISOString(),
      endTime: reconstructDateRange.to.toISOString(),
    });

    setIsReconstructDialogOpen(false);
    setReconstructAgentId('');
  };

  const filteredIncidents = incidents?.filter(incident => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        incident.id.toLowerCase().includes(query) ||
        incident.agent_id?.toLowerCase().includes(query) ||
        incident.narrative_summary?.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'investigating': return <Activity className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'contained': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'resolved': return <Clock className="h-4 w-4 text-green-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Incidentes
          </h1>
          <p className="text-muted-foreground text-xs">
            Visualize e gerencie timelines de incidentes de segurança
          </p>
        </div>

        <Dialog open={isReconstructDialogOpen} onOpenChange={setIsReconstructDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Reconstruir Timeline
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reconstruir Timeline de Incidente</DialogTitle>
              <DialogDescription>
                Analise eventos de um agente em um período específico
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ID do Agente</Label>
                <Input
                  placeholder="UUID do agente..."
                  value={reconstructAgentId}
                  onChange={(e) => setReconstructAgentId(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Período de Análise</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reconstructDateRange?.from ? (
                        reconstructDateRange.to ? (
                          <>
                            {format(reconstructDateRange.from, "dd/MM HH:mm", { locale: ptBR })} -{" "}
                            {format(reconstructDateRange.to, "dd/MM HH:mm", { locale: ptBR })}
                          </>
                        ) : (
                          format(reconstructDateRange.from, "dd/MM/yyyy HH:mm", { locale: ptBR })
                        )
                      ) : (
                        <span>Selecione o período</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={reconstructDateRange?.from}
                      selected={reconstructDateRange}
                      onSelect={setReconstructDateRange}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReconstructDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleReconstruct}
                disabled={reconstructTimeline.isPending || !reconstructAgentId}
              >
                {reconstructTimeline.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  'Reconstruir'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, agente ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Incidents List */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : filteredIncidents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Nenhum incidente encontrado</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {statusFilter !== 'all' 
                ? `Nenhum incidente com status "${INCIDENT_STATUS_LABELS[statusFilter as keyof typeof INCIDENT_STATUS_LABELS]}"`
                : 'Use "Reconstruir Timeline" para analisar eventos de um agente'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredIncidents.map((incident, idx) => (
            <motion.div
              key={incident.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  incident.status === 'open' && "border-red-500/30",
                  incident.status === 'investigating' && "border-yellow-500/30"
                )}
                onClick={() => setSelectedIncident(incident)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(incident.status)}
                        <Badge className={cn("text-xs", INCIDENT_STATUS_COLORS[incident.status as keyof typeof INCIDENT_STATUS_COLORS] || '')}>
                          {INCIDENT_STATUS_LABELS[incident.status as keyof typeof INCIDENT_STATUS_LABELS] || incident.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          #{incident.id.slice(0, 8)}
                        </span>
                      </div>

                      {incident.narrative_summary && (
                        <p className="text-sm text-foreground line-clamp-2 mb-2">
                          {incident.narrative_summary}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Início: {format(new Date(incident.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                        {incident.resolved_at && (
                          <span>
                            Fim: {format(new Date(incident.resolved_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        {incident.agent_id && (
                          <span className="font-mono">
                            Agente: {incident.agent_id.slice(0, 8)}...
                          </span>
                        )}
                        <span>
                          {(incident.timeline_events || []).length} eventos
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Incident Detail Sheet */}
      <Sheet open={!!selectedIncident} onOpenChange={() => setSelectedIncident(null)}>
        <SheetContent className="w-full sm:max-w-2xl p-0">
          {selectedIncident && (
            <IncidentTimelineViewer 
              incident={selectedIncident} 
              onClose={() => setSelectedIncident(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
