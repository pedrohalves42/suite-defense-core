import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Activity, AlertCircle, CheckCircle, Clock, Cpu, HardDrive, MemoryStick, Monitor, Search, XCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { getOsDisplayName, getOsIcon } from '@/lib/os-utils';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface AgentMetrics {
  id: string;
  name: string;
  os_type: 'windows' | 'linux' | 'macos' | 'unknown';
  os_version?: string;
  hostname?: string;
  status: string;
  last_heartbeat: string;
  is_online: boolean;
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  uptime_hours: number | null;
  metrics_age_minutes: number | null;
}

interface DashboardSummary {
  total_agents: number;
  online_agents: number;
  offline_agents: number;
  windows_agents: number;
  linux_agents: number;
  avg_cpu_usage: string | null;
  avg_memory_usage: string | null;
  avg_disk_usage: string | null;
  critical_alerts: number;
  high_alerts: number;
}

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  created_at: string;
  acknowledged: boolean;
  agent_id: string | null;
}

export default function AgentMonitoringAdvanced() {
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  const fetchDashboardData = async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase.functions.invoke('get-agent-dashboard-data', {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (error) throw error;

      setSummary(data.summary);
      setAgents(data.agents);
      setAlerts(data.recent_alerts);
      
      if (showToast) {
        toast({
          title: 'Atualizado',
          description: 'Dados atualizados com sucesso',
        });
      }
    } catch (error) {
      logger.error('Error fetching dashboard data', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar dados',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    const agentsChannel = supabase
      .channel('agents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const metricsChannel = supabase
      .channel('metrics-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_system_metrics_partitioned' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const alertsChannel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_alerts' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const refreshInterval = setInterval(fetchDashboardData, 30000);

    return () => {
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(metricsChannel);
      supabase.removeChannel(alertsChannel);
      clearInterval(refreshInterval);
    };
  }, []);

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: (await supabase.auth.getUser()).data.user?.id 
        })
        .eq('id', alertId);

      if (error) throw error;

      toast({
        title: 'Alerta Resolvido',
        description: 'O alerta foi marcado como resolvido',
      });
      
      fetchDashboardData();
    } catch (error) {
      logger.error('Error acknowledging alert', error);
      toast({
        title: 'Erro',
        description: 'Falha ao resolver alerta',
        variant: 'destructive',
      });
    }
  };

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.hostname?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'online' && agent.is_online) ||
      (statusFilter === 'offline' && !agent.is_online);
    
    return matchesSearch && matchesStatus;
  });

  const getHealthColor = (value: number | null, threshold: number) => {
    if (value === null) return 'text-muted-foreground';
    if (value > threshold) return 'text-destructive';
    if (value > threshold * 0.8) return 'text-warning';
    return 'text-success';
  };

  const getHealthBg = (value: number | null, threshold: number) => {
    if (value === null) return 'bg-muted';
    if (value > threshold) return 'bg-destructive/10';
    if (value > threshold * 0.8) return 'bg-warning/10';
    return 'bg-success/10';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Monitor className="w-8 h-8 text-primary" />
            Monitoramento em Tempo Real
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe a saúde dos seus computadores
          </p>
        </div>
        <Button onClick={() => fetchDashboardData(true)} variant="outline" disabled={isRefreshing}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Computadores</CardTitle>
            <Monitor className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.total_agents || 0}</div>
            <div className="flex gap-3 mt-2 text-sm">
              <span className="flex items-center gap-1 text-success">
                <Wifi className="h-3 w-3" /> {summary?.online_agents || 0} online
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <WifiOff className="h-3 w-3" /> {summary?.offline_agents || 0} offline
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_cpu_usage || '0'), 90))}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processador (Média)</CardTitle>
            <Cpu className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_cpu_usage || '0'), 90))} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_cpu_usage || '0'), 90))}>
              {summary?.avg_cpu_usage ? `${summary.avg_cpu_usage}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(summary?.avg_cpu_usage || '0') > 90 ? '⚠️ Uso elevado' : '✓ Normal'}
            </p>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_memory_usage || '0'), 85))}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memória RAM (Média)</CardTitle>
            <MemoryStick className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_memory_usage || '0'), 85))} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_memory_usage || '0'), 85))}>
              {summary?.avg_memory_usage ? `${summary.avg_memory_usage}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(summary?.avg_memory_usage || '0') > 85 ? '⚠️ Uso elevado' : '✓ Normal'}
            </p>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_disk_usage || '0'), 90))}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Armazenamento (Média)</CardTitle>
            <HardDrive className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_disk_usage || '0'), 90))} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_disk_usage || '0'), 90))}>
              {summary?.avg_disk_usage ? `${summary.avg_disk_usage}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(summary?.avg_disk_usage || '0') > 90 ? '⚠️ Disco cheio' : '✓ Normal'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Alertas Pendentes ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-4 bg-card border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {alert.severity === 'critical' ? 'Crítico' : alert.severity === 'high' ? 'Alto' : 'Médio'}
                      </Badge>
                      <span className="font-semibold">{alert.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatBrazilDateTime(alert.created_at, 'datetime')}
                    </p>
                  </div>
                  <Button 
                    onClick={() => acknowledgeAlert(alert.id)} 
                    variant="outline" 
                    size="sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Resolver
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome do computador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
                size="sm"
              >
                Todos ({summary?.total_agents || 0})
              </Button>
              <Button
                variant={statusFilter === 'online' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('online')}
                size="sm"
                className={statusFilter === 'online' ? '' : 'text-success hover:text-success'}
              >
                <Wifi className="w-4 h-4 mr-1" />
                Online ({summary?.online_agents || 0})
              </Button>
              <Button
                variant={statusFilter === 'offline' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('offline')}
                size="sm"
              >
                <WifiOff className="w-4 h-4 mr-1" />
                Offline ({summary?.offline_agents || 0})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agents Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredAgents.map((agent) => (
          <Card key={agent.id} className={cn(
            "transition-all duration-200 hover:shadow-lg",
            agent.is_online ? "border-success/30" : "border-muted"
          )}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getOsIcon(agent.os_type)}</span>
                  <div>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{agent.hostname || 'N/A'}</p>
                  </div>
                </div>
                <Badge variant={agent.is_online ? 'default' : 'secondary'} className={cn(
                  agent.is_online ? "bg-success text-success-foreground" : ""
                )}>
                  {agent.is_online ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> Online</>
                  ) : (
                    <><XCircle className="w-3 h-3 mr-1" /> Offline</>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Resource Bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Processador</span>
                    <span className={getHealthColor(agent.cpu_usage, 90)}>
                      {agent.cpu_usage !== null ? `${agent.cpu_usage.toFixed(0)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all", 
                        agent.cpu_usage !== null && agent.cpu_usage > 90 ? 'bg-destructive' : 
                        agent.cpu_usage !== null && agent.cpu_usage > 70 ? 'bg-warning' : 'bg-success'
                      )}
                      style={{ width: `${agent.cpu_usage || 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Memória RAM</span>
                    <span className={getHealthColor(agent.memory_usage, 85)}>
                      {agent.memory_usage !== null ? `${agent.memory_usage.toFixed(0)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all", 
                        agent.memory_usage !== null && agent.memory_usage > 85 ? 'bg-destructive' : 
                        agent.memory_usage !== null && agent.memory_usage > 70 ? 'bg-warning' : 'bg-success'
                      )}
                      style={{ width: `${agent.memory_usage || 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Armazenamento</span>
                    <span className={getHealthColor(agent.disk_usage, 90)}>
                      {agent.disk_usage !== null ? `${agent.disk_usage.toFixed(0)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all", 
                        agent.disk_usage !== null && agent.disk_usage > 90 ? 'bg-destructive' : 
                        agent.disk_usage !== null && agent.disk_usage > 80 ? 'bg-warning' : 'bg-success'
                      )}
                      style={{ width: `${agent.disk_usage || 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Info */}
              <div className="flex justify-between items-center pt-2 border-t text-xs text-muted-foreground">
                <span>{getOsDisplayName(agent.os_type, agent.os_version || null)}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {agent.uptime_hours !== null ? `${agent.uptime_hours}h ligado` : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAgents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Monitor className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum computador encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'Tente uma busca diferente' : 'Instale o agente nos computadores para começar o monitoramento'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}