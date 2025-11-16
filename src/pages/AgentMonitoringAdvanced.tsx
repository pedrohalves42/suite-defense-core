import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {  Activity, AlertCircle, CheckCircle, Clock, Cpu, HardDrive, MemoryStick, Monitor, Search, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [osFilter, setOsFilter] = useState<'all' | 'windows' | 'linux'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  const fetchDashboardData = async () => {
    try {
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
    } catch (error) {
      logger.error('Error fetching dashboard data', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar dados do dashboard',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Realtime subscriptions
    const agentsChannel = supabase
      .channel('agents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const metricsChannel = supabase
      .channel('metrics-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_system_metrics' }, () => {
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
        title: 'Alerta Reconhecido',
        description: 'O alerta foi marcado como reconhecido',
      });
      
      fetchDashboardData();
    } catch (error) {
      logger.error('Error acknowledging alert', error);
      toast({
        title: 'Erro',
        description: 'Falha ao reconhecer alerta',
        variant: 'destructive',
      });
    }
  };

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.hostname?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOs = osFilter === 'all' || agent.os_type === osFilter;
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'online' && agent.is_online) ||
      (statusFilter === 'offline' && !agent.is_online);
    
    return matchesSearch && matchesOs && matchesStatus;
  });

  const getStatusBadge = (agent: AgentMetrics) => {
    if (agent.is_online) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Online</Badge>;
    }
    return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Offline</Badge>;
  };

  const getOsIcon = (osType: string) => {
    if (osType === 'windows') return '🪟';
    if (osType === 'linux') return '🐧';
    return '❓';
  };

  const getUsageBadge = (value: number | null, threshold: number) => {
    if (value === null) return <span className="text-muted-foreground">N/A</span>;
    const variant = value > threshold ? 'destructive' : value > threshold * 0.7 ? 'default' : 'secondary';
    return <Badge variant={variant}>{value.toFixed(1)}%</Badge>;
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, string> = {
      critical: 'destructive',
      high: 'default',
      medium: 'secondary',
      low: 'outline',
    };
    return <Badge variant={variants[severity] as any}>{severity.toUpperCase()}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Monitor className="w-8 h-8" />
          Monitoramento em Tempo Real
        </h1>
        <Button onClick={fetchDashboardData} variant="outline">
          <Activity className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Agentes</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_agents || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.online_agents} online • {summary?.offline_agents} offline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Média</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.avg_cpu_usage || 'N/A'}
              {summary?.avg_cpu_usage && '%'}
            </div>
            <p className="text-xs text-muted-foreground">Uso médio de CPU</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RAM Média</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.avg_memory_usage || 'N/A'}
              {summary?.avg_memory_usage && '%'}
            </div>
            <p className="text-xs text-muted-foreground">Uso médio de memória</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disco Médio</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.avg_disk_usage || 'N/A'}
              {summary?.avg_disk_usage && '%'}
            </div>
            <p className="text-xs text-muted-foreground">Uso médio de disco</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Alertas Não Reconhecidos ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityBadge(alert.severity)}
                      <span className="font-semibold">{alert.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(alert.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Button 
                    onClick={() => acknowledgeAlert(alert.id)} 
                    variant="outline" 
                    size="sm"
                  >
                    Reconhecer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou hostname..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={osFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setOsFilter('all')}
                size="sm"
              >
                Todos ({summary?.total_agents})
              </Button>
              <Button
                variant={osFilter === 'windows' ? 'default' : 'outline'}
                onClick={() => setOsFilter('windows')}
                size="sm"
              >
                🪟 Windows ({summary?.windows_agents})
              </Button>
              <Button
                variant={osFilter === 'linux' ? 'default' : 'outline'}
                onClick={() => setOsFilter('linux')}
                size="sm"
              >
                🐧 Linux ({summary?.linux_agents})
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
                size="sm"
              >
                Todos
              </Button>
              <Button
                variant={statusFilter === 'online' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('online')}
                size="sm"
              >
                Online ({summary?.online_agents})
              </Button>
              <Button
                variant={statusFilter === 'offline' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('offline')}
                size="sm"
              >
                Offline ({summary?.offline_agents})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Agentes ({filteredAgents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">OS</th>
                  <th className="text-left p-2">Hostname</th>
                  <th className="text-left p-2">CPU</th>
                  <th className="text-left p-2">RAM</th>
                  <th className="text-left p-2">Disco</th>
                  <th className="text-left p-2">Uptime</th>
                  <th className="text-left p-2">Último Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="border-b hover:bg-muted/50">
                    <td className="p-2">{getStatusBadge(agent)}</td>
                    <td className="p-2 font-medium">{agent.name}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xl">{getOsIcon(agent.os_type)}</span>
                        <span className="text-sm">{agent.os_version || agent.os_type}</span>
                      </div>
                    </td>
                    <td className="p-2 text-sm">{agent.hostname || 'N/A'}</td>
                    <td className="p-2">{getUsageBadge(agent.cpu_usage, 90)}</td>
                    <td className="p-2">{getUsageBadge(agent.memory_usage, 85)}</td>
                    <td className="p-2">{getUsageBadge(agent.disk_usage, 90)}</td>
                    <td className="p-2 text-sm">
                      {agent.uptime_hours !== null ? `${agent.uptime_hours}h` : 'N/A'}
                    </td>
                    <td className="p-2 text-sm text-muted-foreground">
                      {new Date(agent.last_heartbeat).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAgents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum agente encontrado com os filtros aplicados
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
