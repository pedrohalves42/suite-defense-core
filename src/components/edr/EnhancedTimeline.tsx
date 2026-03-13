/**
 * EnhancedTimeline — Unified endpoint timeline with process, file, network events (Sprint 27)
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Terminal, FileText, Globe, Database, AlertTriangle, Clock, Filter } from 'lucide-react';
import { useProcessEvents, useFileEvents, useNetworkEvents, useRegistryEvents, useDetectionEvents } from '@/hooks/useEdrTelemetry';
import { format } from 'date-fns';

interface EnhancedTimelineProps {
  agentId: string;
}

type FilterType = 'all' | 'process' | 'file' | 'network' | 'registry' | 'detection';

const FILTER_OPTIONS: { value: FilterType; label: string; icon: typeof Terminal }[] = [
  { value: 'all', label: 'Todos', icon: Clock },
  { value: 'process', label: 'Processos', icon: Terminal },
  { value: 'file', label: 'Arquivos', icon: FileText },
  { value: 'network', label: 'Rede', icon: Globe },
  { value: 'registry', label: 'Registro', icon: Database },
  { value: 'detection', label: 'Detecções', icon: AlertTriangle },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-l-destructive bg-destructive/5',
  high: 'border-l-orange-500 bg-orange-500/5',
  medium: 'border-l-yellow-500 bg-yellow-500/5',
  low: 'border-l-muted',
};

export function EnhancedTimeline({ agentId }: EnhancedTimelineProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);

  const { data: processEvents } = useProcessEvents(agentId, { limit: 100, suspiciousOnly: suspiciousOnly && filter !== 'detection' });
  const { data: fileEvents } = useFileEvents(agentId, { limit: 100, suspiciousOnly: suspiciousOnly && filter !== 'detection' });
  const { data: networkEvents } = useNetworkEvents(agentId, { limit: 100, suspiciousOnly: suspiciousOnly && filter !== 'detection' });
  const { data: registryEvents } = useRegistryEvents(agentId, { limit: 100, suspiciousOnly: suspiciousOnly && filter !== 'detection' });
  const { data: detectionEvents } = useDetectionEvents({ agentId, limit: 100 });

  const timelineEvents = useMemo(() => {
    const events: Array<{
      id: string;
      type: FilterType;
      time: string;
      title: string;
      details: string;
      severity?: string;
      mitre?: string;
      suspicious: boolean;
      icon: typeof Terminal;
    }> = [];

    if (filter === 'all' || filter === 'process') {
      for (const e of processEvents || []) {
        events.push({
          id: e.id, type: 'process', time: e.event_time,
          title: `${e.event_type}: ${e.process_name} (PID ${e.pid})`,
          details: e.command_line || '',
          mitre: e.mitre_technique_id || undefined,
          suspicious: e.is_suspicious, icon: Terminal,
        });
      }
    }

    if (filter === 'all' || filter === 'file') {
      for (const e of fileEvents || []) {
        events.push({
          id: e.id, type: 'file', time: e.event_time,
          title: `${e.event_type}: ${e.file_name || e.file_path}`,
          details: e.file_path,
          suspicious: e.is_suspicious, icon: FileText,
        });
      }
    }

    if (filter === 'all' || filter === 'network') {
      for (const e of networkEvents || []) {
        events.push({
          id: e.id, type: 'network', time: e.event_time,
          title: `${e.direction} ${e.protocol}: ${e.remote_address || e.domain || 'local'}:${e.remote_port || ''}`,
          details: e.process_name ? `via ${e.process_name}` : '',
          suspicious: e.is_suspicious, icon: Globe,
        });
      }
    }

    if (filter === 'all' || filter === 'registry') {
      for (const e of registryEvents || []) {
        events.push({
          id: e.id, type: 'registry', time: e.event_time,
          title: `${e.event_type}: ${e.value_name || e.key_path}`,
          details: e.key_path,
          mitre: e.mitre_technique_id || undefined,
          suspicious: e.is_suspicious, icon: Database,
        });
      }
    }

    if (filter === 'all' || filter === 'detection') {
      for (const e of detectionEvents || []) {
        events.push({
          id: e.id, type: 'detection', time: e.event_time,
          title: e.detection_name,
          details: e.description || '',
          severity: e.severity,
          mitre: e.mitre_technique_id || undefined,
          suspicious: true, icon: AlertTriangle,
        });
      }
    }

    return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [processEvents, fileEvents, networkEvents, registryEvents, detectionEvents, filter]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline do Endpoint ({timelineEvents.length} eventos)
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={suspiciousOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSuspiciousOnly(!suspiciousOnly)}
              className="h-7 text-xs gap-1"
            >
              <Filter className="h-3 w-3" />
              Suspeitos
            </Button>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-1">
            {timelineEvents.map(event => (
              <div
                key={`${event.type}-${event.id}`}
                className={`flex items-start gap-3 p-2.5 rounded border-l-2 ${event.suspicious ? (SEVERITY_COLORS[event.severity || 'medium'] || 'border-l-yellow-500 bg-yellow-500/5') : 'border-l-transparent'}`}
              >
                <event.icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${event.suspicious ? 'text-destructive' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(event.time), 'HH:mm:ss')}
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase px-1 py-0">
                      {event.type}
                    </Badge>
                    {event.mitre && (
                      <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">
                        {event.mitre}
                      </Badge>
                    )}
                    {event.severity && (
                      <Badge className={`text-[10px] px-1 py-0 ${event.severity === 'critical' ? 'bg-destructive text-destructive-foreground' : ''}`}>
                        {event.severity}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-medium mt-0.5">{event.title}</p>
                  {event.details && (
                    <p className="text-[11px] text-muted-foreground truncate font-mono">{event.details}</p>
                  )}
                </div>
              </div>
            ))}

            {timelineEvents.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum evento de telemetria registrado</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
