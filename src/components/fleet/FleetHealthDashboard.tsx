import { useMemo, useState } from 'react';
import { isAgentOnline } from '@/lib/agent-status-constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Monitor, Wifi, WifiOff, AlertTriangle, CheckCircle, 
  RefreshCw, GitBranch, Clock, ShieldCheck, ArrowUpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { AgentDetailsDrawer } from '@/components/agent/AgentDetailsDrawer';

interface FleetAgent {
  id: string;
  agent_name: string;
  agent_version: string | null;
  status: string;
  last_heartbeat: string | null;
  os_type: string | null;
  os_version: string | null;
  is_isolated: boolean | null;
  is_throttled: boolean | null;
  is_in_safe_mode: boolean | null;
  pending_jobs: number;
}

export function FleetHealthDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string } | null>(null);

  // Fetch fleet data with pending jobs count
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['fleet-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // Get agents
      const { data: agentsData, error } = await supabase
        .from('agents')
        .select('id, agent_name, agent_version, status, last_heartbeat, os_type, os_version, is_isolated, is_throttled, safe_mode_reason')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .order('agent_name');
      
      if (error) throw error;
      
      // Get pending jobs count per agent
      const { data: jobCounts } = await supabase
        .from('jobs')
        .select('agent_name')
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'in_progress']);
      
      const pendingMap = new Map<string, number>();
      jobCounts?.forEach(j => {
        pendingMap.set(j.agent_name, (pendingMap.get(j.agent_name) || 0) + 1);
      });
      
      return (agentsData || []).map(a => ({
        ...a,
        is_in_safe_mode: !!a.safe_mode_reason,
        pending_jobs: pendingMap.get(a.agent_name) || 0,
      })) as FleetAgent[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: 60000,
  });

  // Realtime subscription
  // (uses the existing agents channel from AgentHealthMonitor)

  // Compute fleet stats
  const stats = useMemo(() => {
    let online = 0, offline = 0, outdated = 0, withJobs = 0;
    const versions = new Map<string, number>();
    
    // Find latest version
    let latestVersion = '';
    agents.forEach(a => {
      const v = a.agent_version || '';
      if (v > latestVersion) latestVersion = v;
    });
    
    agents.forEach(a => {
      if (isAgentOnline(a.last_heartbeat)) online++; else offline++;
      if (a.agent_version && a.agent_version !== latestVersion) outdated++;
      if (a.pending_jobs > 0) withJobs++;
      
      const v = a.agent_version || 'desconhecida';
      versions.set(v, (versions.get(v) || 0) + 1);
    });
    
    return { online, offline, outdated, withJobs, total: agents.length, latestVersion, versions };
  }, [agents]);

  const onlinePercent = stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0;
  const versionPercent = stats.total > 0 ? Math.round(((stats.total - stats.outdated) / stats.total) * 100) : 0;

  if (isLoading || tenantLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wifi className="h-3.5 w-3.5" /> Online
            </div>
            <div className="text-2xl font-bold text-success">{stats.online}</div>
            <Progress value={onlinePercent} className="h-1.5 mt-2" />
            <span className="text-[10px] text-muted-foreground">{onlinePercent}% da frota</span>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", stats.offline > 0 ? "border-l-warning" : "border-l-muted")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </div>
            <div className={cn("text-2xl font-bold", stats.offline > 0 ? "text-warning" : "text-muted-foreground")}>{stats.offline}</div>
            <span className="text-[10px] text-muted-foreground">desconectados agora</span>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", stats.outdated > 0 ? "border-l-accent" : "border-l-success")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <GitBranch className="h-3.5 w-3.5" /> Versão
            </div>
            <div className={cn("text-2xl font-bold", stats.outdated > 0 ? "text-accent" : "text-success")}>
              {versionPercent}%
            </div>
            <span className="text-[10px] text-muted-foreground">
              {stats.outdated > 0 ? `${stats.outdated} desatualizados` : 'todos atualizados'}
            </span>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" /> Jobs
            </div>
            <div className="text-2xl font-bold text-primary">{stats.withJobs}</div>
            <span className="text-[10px] text-muted-foreground">com tarefas pendentes</span>
          </CardContent>
        </Card>
      </div>

      {/* Version distribution */}
      {stats.versions.size > 1 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
              Distribuição de Versões
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex gap-2 flex-wrap">
              {Array.from(stats.versions.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([version, count]) => (
                  <Badge 
                    key={version} 
                    variant={version === stats.latestVersion ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {version} — {count} agente{count > 1 ? 's' : ''}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent fleet grid */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              Frota ({stats.total} computadores)
            </CardTitle>
            <Button 
              variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['fleet-health'] })}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((agent, i) => {
              const online = isAgentOnline(agent.last_heartbeat);
              const isOutdated = agent.agent_version && agent.agent_version !== stats.latestVersion;
              const hasIssue = agent.is_isolated || agent.is_throttled || agent.is_in_safe_mode;

              return (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <button
                    onClick={() => setSelectedAgent({ id: agent.id, name: agent.agent_name })}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all hover:shadow-md",
                      "bg-card hover:bg-accent/5",
                      hasIssue && "border-destructive/30",
                      !online && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        online ? "bg-success animate-pulse" : "bg-muted-foreground"
                      )} />
                      <span className="text-sm font-medium truncate">{agent.agent_name}</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {agent.agent_version && (
                        <Badge 
                          variant={isOutdated ? "secondary" : "outline"} 
                          className={cn("text-[10px] px-1.5 py-0", isOutdated && "border-warning/50 text-warning")}
                        >
                          {agent.agent_version}
                        </Badge>
                      )}
                      {agent.pending_jobs > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {agent.pending_jobs} job{agent.pending_jobs > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {hasIssue && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {agent.is_isolated ? 'isolado' : agent.is_throttled ? 'limitado' : 'safe mode'}
                        </Badge>
                      )}
                    </div>

                    {!online && agent.last_heartbeat && (
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Visto {formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true, locale: ptBR })}
                      </p>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Agent Details Drawer */}
      <AgentDetailsDrawer
        agentId={selectedAgent?.id || null}
        agentName={selectedAgent?.name}
        tenantId={tenant?.id}
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
