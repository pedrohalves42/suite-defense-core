/**
 * ThreatHunting — EDR Threat Hunting Query Interface (Sprint 26)
 * Mini-SIEM for searching events across all endpoints.
 */
import { useState, useMemo } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Filter, AlertTriangle, Crosshair, Terminal, FileText, Globe, Database } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { format } from 'date-fns';

type EventSource = 'all' | 'process' | 'file' | 'network' | 'registry' | 'detection';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-muted text-muted-foreground',
};

const SOURCE_ICONS: Record<string, typeof Terminal> = {
  process: Terminal,
  file: FileText,
  network: Globe,
  registry: Database,
  detection: AlertTriangle,
};

export default function ThreatHunting() {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const [searchQuery, setSearchQuery] = useState('');
  const [eventSource, setEventSource] = useState<EventSource>('all');
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = () => {
    setSearchTerm(searchQuery);
    setIsSearching(true);
  };

  const { data: results, isLoading } = useQuery({
    queryKey: ['threat-hunt', activeTenant?.id, searchTerm, eventSource, suspiciousOnly],
    queryFn: async () => {
      const tenantId = activeTenant!.id;
      const allResults: any[] = [];
      const term = searchTerm.toLowerCase();

      const sources = eventSource === 'all'
        ? ['process', 'file', 'network', 'registry', 'detection']
        : [eventSource];

      for (const source of sources) {
        const table = source === 'detection' ? 'endpoint_detection_events' : `endpoint_${source}_events`;

        let query = supabase
          .from(table)
          .select('*')
          .eq('tenant_id', tenantId)
          .order('event_time', { ascending: false })
          .limit(100);

        if (suspiciousOnly && source !== 'detection') {
          query = query.eq('is_suspicious', true);
        }

        // Text search across relevant fields
        if (term) {
          if (source === 'process') {
            query = query.or(`process_name.ilike.%${term}%,command_line.ilike.%${term}%,user_name.ilike.%${term}%`);
          } else if (source === 'file') {
            query = query.or(`file_path.ilike.%${term}%,file_name.ilike.%${term}%,sha256_hash.ilike.%${term}%`);
          } else if (source === 'network') {
            query = query.or(`remote_address.ilike.%${term}%,domain.ilike.%${term}%,process_name.ilike.%${term}%`);
          } else if (source === 'registry') {
            query = query.or(`key_path.ilike.%${term}%,value_name.ilike.%${term}%,value_data.ilike.%${term}%`);
          } else if (source === 'detection') {
            query = query.or(`detection_name.ilike.%${term}%,command_line.ilike.%${term}%,mitre_technique_id.ilike.%${term}%`);
          }
        }

        const { data } = await query;
        if (data) {
          allResults.push(...data.map((row: any) => ({ ...row, _source: source })));
        }
      }

      // Sort by event_time desc
      return allResults.sort((a, b) =>
        new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
      );
    },
    enabled: isSearching && !tenantLoading && !!activeTenant?.id,
  });

  const stats = useMemo(() => {
    if (!results) return { total: 0, suspicious: 0, bySource: {} as Record<string, number> };
    const bySource: Record<string, number> = {};
    let suspicious = 0;
    for (const r of results) {
      bySource[r._source] = (bySource[r._source] || 0) + 1;
      if (r.is_suspicious || r._source === 'detection') suspicious++;
    }
    return { total: results.length, suspicious, bySource };
  }, [results]);

  return (
    <AdminPageLayout
      title="Threat Hunting"
      description="Busque eventos em todos os endpoints — detecção avançada de ameaças"
      icon={Crosshair}
    >
      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: powershell.exe, encoded, mimikatz, T1059, 192.168..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select value={eventSource} onValueChange={(v) => setEventSource(v as EventSource)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Fonte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Eventos</SelectItem>
                <SelectItem value="process">Processos</SelectItem>
                <SelectItem value="file">Arquivos</SelectItem>
                <SelectItem value="network">Rede</SelectItem>
                <SelectItem value="registry">Registro</SelectItem>
                <SelectItem value="detection">Detecções</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={suspiciousOnly ? 'default' : 'outline'}
              onClick={() => setSuspiciousOnly(!suspiciousOnly)}
              className="gap-1.5"
            >
              <Filter className="h-4 w-4" />
              Suspeitos
            </Button>
            <Button onClick={handleSearch} className="gap-1.5">
              <Search className="h-4 w-4" />
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {isSearching && results && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Resultados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-destructive">{stats.suspicious}</p>
              <p className="text-xs text-muted-foreground">Suspeitos</p>
            </CardContent>
          </Card>
          {Object.entries(stats.bySource).map(([source, count]) => (
            <Card key={source}>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">{source}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {isSearching && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {isLoading ? 'Buscando...' : `${results?.length || 0} eventos encontrados`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {(results || []).map((event, idx) => {
                  const Icon = SOURCE_ICONS[event._source] || AlertTriangle;
                  const severity = event.severity || (event.is_suspicious ? 'medium' : 'low');

                  return (
                    <div
                      key={`${event._source}-${event.id}-${idx}`}
                      className={`p-3 rounded-lg border ${event.is_suspicious || event._source === 'detection' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {event._source}
                            </Badge>
                            {severity && (
                              <Badge className={`text-[10px] ${SEVERITY_COLORS[severity] || ''}`}>
                                {severity}
                              </Badge>
                            )}
                            {event.mitre_technique_id && (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {event.mitre_technique_id}
                              </Badge>
                            )}
                            {event.detection_name && (
                              <span className="text-xs font-medium text-destructive">{event.detection_name}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {format(new Date(event.event_time), 'dd/MM HH:mm:ss')}
                            </span>
                          </div>

                          {/* Event details */}
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {event.process_name && (
                              <p><span className="text-foreground font-medium">Processo:</span> {event.process_name} (PID: {event.pid || event.process_pid})</p>
                            )}
                            {event.command_line && (
                              <p className="font-mono text-[11px] truncate max-w-full">
                                <span className="text-foreground font-medium">CMD:</span> {event.command_line}
                              </p>
                            )}
                            {event.file_path && (
                              <p><span className="text-foreground font-medium">Arquivo:</span> {event.file_path}</p>
                            )}
                            {event.remote_address && (
                              <p><span className="text-foreground font-medium">Destino:</span> {event.remote_address}:{event.remote_port}</p>
                            )}
                            {event.key_path && (
                              <p className="truncate"><span className="text-foreground font-medium">Chave:</span> {event.key_path}</p>
                            )}
                            {event.domain && (
                              <p><span className="text-foreground font-medium">Domínio:</span> {event.domain}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!isLoading && results?.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Nenhum evento encontrado para esta busca</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!isSearching && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Crosshair className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Threat Hunting</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Busque por processos, arquivos, conexões de rede e eventos de registro em todos os endpoints.
              Use termos como <code className="text-xs bg-muted px-1 py-0.5 rounded">powershell encoded</code>,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">T1059</code>, ou{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">mimikatz</code>.
            </p>
          </CardContent>
        </Card>
      )}
    </AdminPageLayout>
  );
}
