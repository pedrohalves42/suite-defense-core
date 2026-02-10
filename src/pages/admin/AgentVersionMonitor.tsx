import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, GitBranch, Shield, CheckCircle, XCircle, Clock, AlertTriangle, Zap, HelpCircle } from 'lucide-react';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AgentWithCapabilities {
  id: string;
  agent_name: string;
  hostname: string | null;
  agent_version: string | null;
  ed25519_supported: boolean | null;
  signature_mode: string | null;
  status: string;
  last_heartbeat: string | null;
  os_type: string | null;
}

export default function AgentVersionMonitor() {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const { data: agents, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['agent-version-monitor', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, hostname, agent_version, ed25519_supported, signature_mode, status, last_heartbeat, os_type')
        .eq('tenant_id', tenant.id)
        .order('agent_name');
      
      if (error) throw error;
      return (data || []) as AgentWithCapabilities[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  const { data: latestRelease } = useQuery({
    queryKey: ['latest-agent-release'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases')
        .select('version')
        .eq('is_active', true)
        .eq('platform', 'windows')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data?.version || null;
    },
  });

  // Calculate stats
  const stats = agents ? {
    total: agents.length,
    onLatest: agents.filter(a => a.agent_version === latestRelease).length,
    withEd25519: agents.filter(a => a.ed25519_supported === true).length,
    withoutEd25519: agents.filter(a => a.ed25519_supported === false).length,
    unknownEd25519: agents.filter(a => a.ed25519_supported === null).length,
    strictMode: agents.filter(a => a.signature_mode === 'strict').length,
    auditMode: agents.filter(a => a.signature_mode === 'audit_only').length,
    unknownMode: agents.filter(a => !a.signature_mode).length,
    online: agents.filter(a => {
      if (!a.last_heartbeat) return false;
      const diff = Date.now() - new Date(a.last_heartbeat).getTime();
      return diff < 5 * 60 * 1000; // 5 minutes
    }).length,
  } : null;

  // Group by version
  const versionGroups = agents?.reduce((acc, agent) => {
    const version = agent.agent_version || 'Desconhecida';
    if (!acc[version]) acc[version] = [];
    acc[version].push(agent);
    return acc;
  }, {} as Record<string, AgentWithCapabilities[]>) || {};

  const sortedVersions = Object.entries(versionGroups)
    .sort(([a], [b]) => {
      if (a === 'Desconhecida') return 1;
      if (b === 'Desconhecida') return -1;
      return b.localeCompare(a, undefined, { numeric: true });
    });

  const handleForceUpdate = async (agentId: string, agentName: string) => {
    if (!latestRelease) {
      toast({
        title: 'Erro',
        description: 'Nenhuma versão de release ativa encontrada',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('agents')
      .update({
        force_update_version: latestRelease,
        force_update_reason: 'Forced via Version Monitor Dashboard',
        force_update_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (error) {
      toast({
        title: 'Erro',
        description: `Falha ao agendar update: ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Update Agendado',
        description: `${agentName} será atualizado para ${latestRelease} no próximo heartbeat`,
      });
      refetch();
    }
  };

  const handleForceUpdateAll = async () => {
    if (!latestRelease || !agents) {
      toast({
        title: 'Erro',
        description: 'Nenhuma versão de release ativa encontrada',
        variant: 'destructive',
      });
      return;
    }

    const outdatedAgents = agents.filter(a => a.agent_version !== latestRelease);
    if (outdatedAgents.length === 0) {
      toast({
        title: 'Info',
        description: 'Todos os agentes já estão na versão mais recente',
      });
      return;
    }

    const outdatedIds = outdatedAgents.map(a => a.id);
    const { error } = await supabase
      .from('agents')
      .update({
        force_update_version: latestRelease,
        force_update_reason: 'Bulk force update via Version Monitor',
        force_update_at: new Date().toISOString(),
      })
      .in('id', outdatedIds);

    if (error) {
      toast({
        title: 'Erro',
        description: `Falha ao agendar updates: ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Updates Agendados',
        description: `${outdatedAgents.length} agentes serão atualizados para ${latestRelease}`,
      });
      refetch();
    }
  };

  const getStatusBadge = (agent: AgentWithCapabilities) => {
    if (!agent.last_heartbeat) {
      return <Badge variant="outline" className="text-muted-foreground">Nunca conectou</Badge>;
    }
    const diff = Date.now() - new Date(agent.last_heartbeat).getTime();
    if (diff < 5 * 60 * 1000) {
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>;
    }
    if (diff < 30 * 60 * 1000) {
      return <Badge variant="outline" className="text-yellow-500 border-yellow-500/20">Recente</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Offline</Badge>;
  };

  const getEd25519Badge = (supported: boolean | null) => {
    if (supported === true) {
      return (
        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
          <CheckCircle className="h-3 w-3 mr-1" />
          Suportado
        </Badge>
      );
    }
    if (supported === false) {
      return (
        <Badge variant="outline" className="text-orange-500 border-orange-500/20">
          <XCircle className="h-3 w-3 mr-1" />
          Não suportado
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <HelpCircle className="h-3 w-3 mr-1" />
        N/A
      </Badge>
    );
  };

  const getSignatureModeBadge = (mode: string | null) => {
    if (mode === 'strict') {
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          <Shield className="h-3 w-3 mr-1" />
          Strict
        </Badge>
      );
    }
    if (mode === 'audit_only') {
      return (
        <Badge variant="outline" className="text-yellow-500 border-yellow-500/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Audit
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <HelpCircle className="h-3 w-3 mr-1" />
        N/A
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="h-6 w-6" />
              Monitoramento de Versões
            </h1>
            <p className="text-muted-foreground">
              Acompanhe versões e capabilities dos agentes • Versão mais recente: {latestRelease || 'N/A'}
            </p>
          </div>
          <div className="flex gap-2">
            {stats && stats.total - stats.onLatest > 0 && latestRelease && (
              <Button onClick={handleForceUpdateAll} variant="default" size="sm">
                <Zap className="h-4 w-4 mr-2" />
                Forçar Update para Todos ({stats.total - stats.onLatest})
              </Button>
            )}
            <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Version Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Versão Mais Recente</CardDescription>
              <CardTitle className="text-2xl">{stats?.onLatest || 0} / {stats?.total || 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress 
                value={stats?.total ? (stats.onLatest / stats.total) * 100 : 0} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {stats?.total ? Math.round((stats.onLatest / stats.total) * 100) : 0}% em {latestRelease || 'N/A'}
              </p>
            </CardContent>
          </Card>

          {/* Ed25519 Support */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ed25519 Suportado</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                {stats?.withEd25519 || 0} / {stats?.total || 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 text-xs">
                <span className="text-green-500">✓ {stats?.withEd25519 || 0}</span>
                <span className="text-orange-500">✗ {stats?.withoutEd25519 || 0}</span>
                <span className="text-muted-foreground">? {stats?.unknownEd25519 || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Signature Mode */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Modo de Assinatura</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {stats?.strictMode || 0} strict
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 text-xs">
                <span className="text-primary">Strict: {stats?.strictMode || 0}</span>
                <span className="text-yellow-500">Audit: {stats?.auditMode || 0}</span>
                <span className="text-muted-foreground">N/A: {stats?.unknownMode || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Online Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Status Online</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Clock className="h-5 w-5 text-green-500" />
                {stats?.online || 0} / {stats?.total || 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress 
                value={stats?.total ? (stats.online / stats.total) * 100 : 0} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {stats?.total ? Math.round((stats.online / stats.total) * 100) : 0}% online
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Version Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Versão</CardTitle>
            <CardDescription>Agentes agrupados por versão instalada</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedVersions.map(([version, versionAgents]) => {
                const percentage = stats?.total ? (versionAgents.length / stats.total) * 100 : 0;
                const isLatest = version === latestRelease;
                
                return (
                  <div key={version} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={isLatest ? 'font-medium text-primary' : ''}>
                          {version}
                        </span>
                        {isLatest && (
                          <Badge variant="outline" className="text-xs">Mais recente</Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {versionAgents.length} ({Math.round(percentage)}%)
                      </span>
                    </div>
                    <Progress 
                      value={percentage} 
                      className={`h-2 ${isLatest ? '[&>div]:bg-primary' : '[&>div]:bg-muted-foreground'}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Agents Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhes dos Agentes</CardTitle>
            <CardDescription>
              Lista completa com versão, capabilities e ações disponíveis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Ed25519</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Heartbeat</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents?.map((agent) => {
                  const isOutdated = agent.agent_version !== latestRelease;
                  
                  return (
                    <TableRow key={agent.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{agent.agent_name}</div>
                          {agent.hostname && (
                            <div className="text-xs text-muted-foreground">{agent.hostname}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={isOutdated ? 'outline' : 'default'}
                          className={isOutdated ? 'text-orange-500 border-orange-500/20' : ''}
                        >
                          {agent.agent_version || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getEd25519Badge(agent.ed25519_supported)}
                      </TableCell>
                      <TableCell>
                        {getSignatureModeBadge(agent.signature_mode)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(agent)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {agent.last_heartbeat 
                          ? formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true, locale: ptBR })
                          : 'Nunca'
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        {isOutdated && latestRelease && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleForceUpdate(agent.id, agent.agent_name)}
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                Update
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Forçar atualização para {latestRelease}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {!isOutdated && (
                          <span className="text-xs text-green-500 flex items-center justify-end gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Atualizado
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!agents || agents.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum agente encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}