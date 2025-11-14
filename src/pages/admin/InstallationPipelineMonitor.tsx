import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentLifecycle, usePipelineMetrics } from "@/hooks/useAgentLifecycle";
import { useTenant } from "@/hooks/useTenant";
import { useState } from "react";
import { 
  TrendingUp, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  Download, 
  Copy, 
  Activity,
  Clock,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FunnelChart,
  Funnel,
  LabelList,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { ErrorState } from "@/components/ErrorState";
import { exportToCSV } from "@/lib/csv-export";
import { toast } from "sonner";

export default function InstallationPipelineMonitor() {
  const { tenant } = useTenant();
  const [hoursBack, setHoursBack] = useState<number>(24);
  const [stageFilter, setStageFilter] = useState<string>('all');

  const { data: agents, isLoading: agentsLoading, isError: agentsError, error: agentsErrorData, refetch: refetchAgents } = useAgentLifecycle(tenant?.id);
  const { data: metrics, isLoading: metricsLoading, isError: metricsError, error: metricsErrorData, refetch: refetchMetrics } = usePipelineMetrics(tenant?.id, hoursBack);

  const filteredAgents = agents?.filter(agent => {
    if (stageFilter === 'all') return true;
    if (stageFilter === 'stuck') return agent.flags.is_stuck;
    if (stageFilter === 'errors') return agent.flags.has_errors;
    return agent.lifecycle_stage === stageFilter;
  });

  // Funnel data for visualization
  const funnelData = metrics ? [
    { name: 'Gerados', value: metrics.total_generated, fill: '#3b82f6' },
    { name: 'Baixados', value: metrics.total_downloaded, fill: '#8b5cf6' },
    { name: 'Comando Copiado', value: metrics.total_command_copied, fill: '#f59e0b' },
    { name: 'Instalados', value: metrics.total_installed, fill: '#10b981' },
    { name: 'Ativos', value: metrics.total_active, fill: '#059669' },
  ] : [];

  if (agentsLoading || metricsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (agentsError || metricsError) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState 
          error={agentsErrorData || metricsErrorData!} 
          onRetry={() => {
            refetchAgents();
            refetchMetrics();
          }}
          title="Erro ao Carregar Pipeline de Instalação"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pipeline de Instalação</h1>
          <p className="text-muted-foreground">Monitoramento em tempo real do fluxo de instalação de agentes</p>
        </div>
        <Select value={hoursBack.toString()} onValueChange={(v) => setHoursBack(parseInt(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Última hora</SelectItem>
            <SelectItem value="6">Últimas 6 horas</SelectItem>
            <SelectItem value="24">Últimas 24 horas</SelectItem>
            <SelectItem value="72">Últimos 3 dias</SelectItem>
            <SelectItem value="168">Última semana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.success_rate_pct || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.total_installed || 0} / {metrics?.total_command_copied || 0} instalados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Ativos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total_active || 0}</div>
            <p className="text-xs text-muted-foreground">
              Enviando heartbeats
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(metrics?.avg_install_time_seconds || 0)}s</div>
            <p className="text-xs text-muted-foreground">
              De instalação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.conversion_rate_generated_to_installed_pct || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Gerado → Instalado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Travados</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{metrics?.total_stuck || 0}</div>
            <p className="text-xs text-muted-foreground">
              {'>'}30min sem conclusão
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Funil de Instalação</CardTitle>
          <CardDescription>Visualização do fluxo de instalação de agentes</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <FunnelChart>
              <Tooltip />
              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive
              >
                <LabelList position="right" fill="#000" stroke="none" dataKey="name" />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Agents Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Agentes</CardTitle>
              <CardDescription>Lista detalhada com status atual e ações disponíveis</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!filteredAgents || filteredAgents.length === 0) {
                    toast.error('Nenhum agente para exportar');
                    return;
                  }
                  
                  exportToCSV(
                    filteredAgents.map(a => ({
                      agent_name: a.agent_name,
                      lifecycle_stage: a.lifecycle_stage,
                      status: a.status_badge.label,
                      install_time_seconds: a.metrics.install_time_seconds || 0,
                      last_seen: a.metrics.last_seen ? format(new Date(a.metrics.last_seen), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Nunca',
                      is_stuck: a.flags.is_stuck ? 'Sim' : 'Não',
                      has_errors: a.flags.has_errors ? 'Sim' : 'Não',
                    })),
                    'agents-pipeline',
                    [
                      { key: 'agent_name', label: 'Nome do Agente' },
                      { key: 'lifecycle_stage', label: 'Estágio' },
                      { key: 'status', label: 'Status' },
                      { key: 'install_time_seconds', label: 'Tempo Instalação (s)' },
                      { key: 'last_seen', label: 'Última Visibilidade' },
                      { key: 'is_stuck', label: 'Travado' },
                      { key: 'has_errors', label: 'Com Erros' },
                    ]
                  );
                  
                  toast.success(`${filteredAgents.length} agentes exportados com sucesso`);
                }}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por estágio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({agents?.length || 0})</SelectItem>
                <SelectItem value="active">Ativos ({agents?.filter(a => a.lifecycle_stage === 'active').length || 0})</SelectItem>
                <SelectItem value="installing">Instalando ({agents?.filter(a => a.lifecycle_stage === 'installing').length || 0})</SelectItem>
                <SelectItem value="stuck">Travados ({agents?.filter(a => a.flags.is_stuck).length || 0})</SelectItem>
                <SelectItem value="errors">Com Erros ({agents?.filter(a => a.flags.has_errors).length || 0})</SelectItem>
              </SelectContent>
            </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Tempo</TableHead>
                <TableHead>Último Visto</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents?.map((agent) => (
                <TableRow key={agent.agent_id}>
                  <TableCell className="font-medium">{agent.agent_name}</TableCell>
                  <TableCell>
                    <Badge variant={
                      agent.status_badge.color === 'success' ? 'default' :
                      agent.status_badge.color === 'error' ? 'destructive' :
                      agent.status_badge.color === 'warning' ? 'secondary' : 'outline'
                    }>
                      {agent.status_badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {agent.timeline.generated && <CheckCircle className="h-4 w-4 text-blue-500" />}
                      {agent.timeline.downloaded && <Download className="h-4 w-4 text-purple-500" />}
                      {agent.timeline.command_copied && <Copy className="h-4 w-4 text-orange-500" />}
                      {agent.timeline.installed && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {agent.timeline.active && <Activity className="h-4 w-4 text-emerald-600" />}
                      {agent.flags.is_stuck && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {agent.metrics.install_time_seconds ? `${agent.metrics.install_time_seconds}s` : '-'}
                  </TableCell>
                  <TableCell>
                    {agent.metrics.last_seen ? format(new Date(agent.metrics.last_seen), "dd/MM HH:mm", { locale: ptBR }) : 'Nunca'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {agent.actions.can_view_logs && (
                        <Button variant="ghost" size="sm">Logs</Button>
                      )}
                      {agent.actions.can_retry_install && (
                        <Button variant="ghost" size="sm">Retry</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
