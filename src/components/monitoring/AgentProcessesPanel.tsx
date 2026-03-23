import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cog, AlertTriangle, Cpu, MemoryStick, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface ProcessData {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  user: string;
  command_line?: string;
}

interface ServiceData {
  name: string;
  display_name: string;
  status: string;
  startup_type: string;
}

interface ProcessSnapshot {
  id: string;
  agent_id: string;
  processes: ProcessData[];
  services: ServiceData[];
  total_processes: number;
  total_services: number;
  services_running: number;
  services_stopped: number;
  new_processes: ProcessData[];
  suspicious_processes: ProcessData[];
  collected_at: string;
}

interface Props {
  agentId: string;
  agentName: string;
}

export function AgentProcessesPanel({ agentId, agentName }: Props) {
  const [snapshot, setSnapshot] = useState<ProcessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('processes');

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('agent_processes')
        .select('id, agent_id, processes, collected_at, total_processes, total_threads')
        .eq('agent_id', agentId)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setSnapshot(data as unknown as ProcessSnapshot | null);
    } catch (error) {
      logger.error('Error fetching process data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) fetchData();
  }, [agentId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Carregando processos...
        </CardContent>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          <Cog className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>Nenhum dado de processos disponível para {agentName}</p>
          <p className="text-xs mt-1">O agente precisa enviar dados de processos</p>
        </CardContent>
      </Card>
    );
  }

  const sortedProcesses = [...(snapshot.processes || [])].sort((a, b) => b.cpu_percent - a.cpu_percent);
  const sortedServices = [...(snapshot.services || [])];
  const suspiciousProcesses = (snapshot.suspicious_processes || []).filter(
    (proc) => typeof proc?.name === 'string' && proc.name.trim().length > 0
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cog className="h-4 w-4" />
              Processos & Serviços — {agentName}
            </CardTitle>
            <CardDescription>
              Última coleta: {formatBrazilDateTime(snapshot.collected_at)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {suspiciousProcesses.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {suspiciousProcesses.length} suspeito(s)
              </Badge>
            )}
            {snapshot.new_processes.length > 0 && (
              <Badge variant="outline" className="gap-1">
                {snapshot.new_processes.length} novo(s)
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-2 rounded bg-muted/50">
            <div className="text-lg font-bold">{snapshot.total_processes}</div>
            <div className="text-xs text-muted-foreground">Processos</div>
          </div>
          <div className="text-center p-2 rounded bg-muted/50">
            <div className="text-lg font-bold">{snapshot.total_services}</div>
            <div className="text-xs text-muted-foreground">Serviços</div>
          </div>
          <div className="text-center p-2 rounded bg-success/10">
            <div className="text-lg font-bold text-success">{snapshot.services_running}</div>
            <div className="text-xs text-muted-foreground">Em Execução</div>
          </div>
          <div className="text-center p-2 rounded bg-muted/50">
            <div className="text-lg font-bold">{snapshot.services_stopped}</div>
            <div className="text-xs text-muted-foreground">Parados</div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="processes" className="flex-1">
              <Cpu className="h-3.5 w-3.5 mr-1" /> Processos ({sortedProcesses.length})
            </TabsTrigger>
            <TabsTrigger value="services" className="flex-1">
              <Cog className="h-3.5 w-3.5 mr-1" /> Serviços ({sortedServices.length})
            </TabsTrigger>
            {suspiciousProcesses.length > 0 && (
              <TabsTrigger value="suspicious" className="flex-1">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Suspeitos
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="processes">
            <ScrollArea className="h-72">
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2 py-1 sticky top-0 bg-background">
                  <span className="col-span-1">PID</span>
                  <span className="col-span-4">Nome</span>
                  <span className="col-span-2 text-right">CPU %</span>
                  <span className="col-span-2 text-right">Memória</span>
                  <span className="col-span-3">Usuário</span>
                </div>
                {sortedProcesses.map((proc, i) => (
                  <div
                    key={`${proc.pid}-${i}`}
                    className={cn(
                      "grid grid-cols-12 gap-2 text-sm px-2 py-1 rounded hover:bg-accent/5",
                      proc.cpu_percent > 50 && "bg-destructive/5"
                    )}
                  >
                    <span className="col-span-1 text-muted-foreground text-xs">{proc.pid}</span>
                    <span className="col-span-4 truncate font-mono text-xs">{proc.name}</span>
                    <span className={cn(
                      "col-span-2 text-right text-xs",
                      proc.cpu_percent > 50 ? "text-destructive font-medium" : "text-muted-foreground"
                    )}>
                      {proc.cpu_percent?.toFixed(1)}%
                    </span>
                    <span className="col-span-2 text-right text-xs text-muted-foreground">
                      {proc.memory_mb?.toFixed(0)} MB
                    </span>
                    <span className="col-span-3 truncate text-xs text-muted-foreground">{proc.user}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="services">
            <ScrollArea className="h-72">
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2 py-1 sticky top-0 bg-background">
                  <span className="col-span-4">Serviço</span>
                  <span className="col-span-4">Nome</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-2">Início</span>
                </div>
                {sortedServices.map((svc, i) => (
                  <div
                    key={`${svc.name}-${i}`}
                    className="grid grid-cols-12 gap-2 text-sm px-2 py-1 rounded hover:bg-accent/5"
                  >
                    <span className="col-span-4 truncate font-mono text-xs">{svc.name}</span>
                    <span className="col-span-4 truncate text-xs text-muted-foreground">{svc.display_name}</span>
                    <span className="col-span-2">
                      <Badge
                        variant={svc.status === 'Running' ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5"
                      >
                        {svc.status}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground">{svc.startup_type}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {suspiciousProcesses.length > 0 && (
            <TabsContent value="suspicious">
              <div className="space-y-2">
                {suspiciousProcesses.map((proc, i) => (
                  <div key={i} className="p-2 rounded border border-destructive/30 bg-destructive/5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="font-mono text-sm font-medium">{proc.name}</span>
                      <Badge variant="destructive" className="text-[10px]">PID {proc.pid}</Badge>
                    </div>
                    {proc.command_line && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                        {proc.command_line}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
