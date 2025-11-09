import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, TrendingUp, Wifi, WifiOff, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  last_heartbeat: string | null;
  enrolled_at: string;
}

interface Job {
  id: string;
  type: string;
  status: string;
  agent_name: string;
  created_at: string;
  completed_at: string | null;
}

const AgentMonitoring = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);

  // Fetch initial data
  const { data: initialAgents } = useQuery({
    queryKey: ['agents-monitoring'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('enrolled_at', { ascending: false });
      
      if (error) throw error;
      return data as Agent[];
    }
  });

  const { data: initialJobs } = useQuery({
    queryKey: ['jobs-monitoring'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as Job[];
    }
  });

  // Setup realtime subscriptions
  useEffect(() => {
    if (initialAgents) setAgents(initialAgents);
    if (initialJobs) setRecentJobs(initialJobs);

    // Subscribe to agents changes
    const agentsChannel = supabase
      .channel('agents-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents'
        },
        (payload) => {
          console.log('[Realtime] Agent change:', payload);
          
          if (payload.eventType === 'INSERT') {
            setAgents(prev => [payload.new as Agent, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAgents(prev => prev.map(a => a.id === payload.new.id ? payload.new as Agent : a));
          } else if (payload.eventType === 'DELETE') {
            setAgents(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to jobs changes
    const jobsChannel = supabase
      .channel('jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs'
        },
        (payload) => {
          console.log('[Realtime] Job change:', payload);
          
          if (payload.eventType === 'INSERT') {
            setRecentJobs(prev => [payload.new as Job, ...prev].slice(0, 10));
          } else if (payload.eventType === 'UPDATE') {
            setRecentJobs(prev => prev.map(j => j.id === payload.new.id ? payload.new as Job : j));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [initialAgents, initialJobs]);

  // Calculate metrics
  const totalAgents = agents.length;
  const onlineAgents = agents.filter(a => a.status === 'active' || a.status === 'online').length;
  const offlineAgents = agents.filter(a => a.status === 'offline').length;
  const successRate = recentJobs.length > 0 
    ? Math.round((recentJobs.filter(j => j.status === 'done').length / recentJobs.length) * 100)
    : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'online':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Online</Badge>;
      case 'offline':
        return <Badge variant="destructive"><WifiOff className="w-3 h-3 mr-1" />Offline</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return <Badge className="bg-green-500">Concluído</Badge>;
      case 'queued':
        return <Badge className="bg-blue-500">Fila</Badge>;
      case 'delivered':
        return <Badge className="bg-yellow-500">Em Progresso</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTimeSince = (date: string | null) => {
    if (!date) return 'Nunca';
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d atrás`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <Activity className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Monitoramento em Tempo Real
          </h1>
          <p className="text-sm text-muted-foreground">Acompanhe status e performance dos agentes</p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Agentes</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAgents}</div>
            <p className="text-xs text-muted-foreground">
              {onlineAgents} online, {offlineAgents} offline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Online</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{onlineAgents}</div>
            <p className="text-xs text-muted-foreground">
              {totalAgents > 0 ? Math.round((onlineAgents / totalAgents) * 100) : 0}% do total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Offline</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{offlineAgents}</div>
            <p className="text-xs text-muted-foreground">
              Requerem atenção imediata
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              Últimos 10 jobs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agents Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Status dos Agentes
          </CardTitle>
          <CardDescription>Atualização em tempo real via WebSocket</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum agente cadastrado</p>
            ) : (
              agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${
                      agent.status === 'active' || agent.status === 'online' 
                        ? 'bg-green-500 animate-pulse' 
                        : 'bg-red-500'
                    }`} />
                    <div>
                      <p className="font-medium">{agent.agent_name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        Último heartbeat: {getTimeSince(agent.last_heartbeat)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(agent.status)}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(agent.enrolled_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Jobs Recentes
          </CardTitle>
          <CardDescription>Últimos 10 jobs executados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentJobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum job executado ainda</p>
            ) : (
              recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div>
                    <p className="font-medium text-sm">{job.type}</p>
                    <p className="text-xs text-muted-foreground">
                      Agente: {job.agent_name} • {format(new Date(job.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {getJobStatusBadge(job.status)}
                    {job.completed_at && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)}s
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentMonitoring;
