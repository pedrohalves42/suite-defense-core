import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/useTenant';
import { Activity, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AgentMigrationStats {
  agent_name: string;
  total_jobs: number;
  v3_jobs: number;
  v1_jobs: number;
  v3_percentage: number;
  last_heartbeat: string | null;
}

export default function JobsV3Migration() {
  const { tenant } = useTenant();

  const { data: migrationStats, isLoading } = useQuery({
    queryKey: ['jobs-v3-migration-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('jobs')
        .select('id, agent_name, output, status, created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', sevenDaysAgo)
        .in('status', ['done', 'completed', 'failed']);

      if (error) throw error;

      const total = data.length;
      const v3Jobs = data.filter((j) => j.output !== null).length;
      const v1Jobs = total - v3Jobs;
      const v3Percentage = total > 0 ? (v3Jobs / total) * 100 : 0;

      // Estatisticas por agente
      const agentStatsMap = new Map<string, { v3: number; v1: number }>();
      for (const job of data) {
        if (!agentStatsMap.has(job.agent_name)) {
          agentStatsMap.set(job.agent_name, { v3: 0, v1: 0 });
        }
        const stats = agentStatsMap.get(job.agent_name)!;
        if (job.output !== null) stats.v3++;
        else stats.v1++;
      }

      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      const agents = (agentsRaw as unknown as Array<{ agent_name: string; last_heartbeat: string | null }>) || [];

      const agentHeartbeats = new Map(
        agents?.map((a) => [a.agent_name, a.last_heartbeat]) || []
      );

      const agentStats: AgentMigrationStats[] = Array.from(agentStatsMap.entries())
        .map(([name, stats]) => ({
          agent_name: name,
          total_jobs: stats.v3 + stats.v1,
          v3_jobs: stats.v3,
          v1_jobs: stats.v1,
          v3_percentage: ((stats.v3 / (stats.v3 + stats.v1)) * 100),
          last_heartbeat: agentHeartbeats.get(name) || null,
        }))
        .sort((a, b) => a.v3_percentage - b.v3_percentage);

      return {
        total,
        v3Jobs,
        v1Jobs,
        v3Percentage,
        agentStats,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading || !migrationStats) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Migracao Jobs v1 ? v3</h1>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Activity className="animate-spin h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return 'text-success';
    if (percentage >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getStatusBadge = (percentage: number) => {
    if (percentage >= 80) return <Badge variant="default" className="bg-success">Otimo</Badge>;
    if (percentage >= 50) return <Badge variant="secondary">Em Progresso</Badge>;
    return <Badge variant="destructive">Atencao</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Migracao Jobs v1 ? v3</h1>
        <p className="text-muted-foreground">
          Monitoramento do processo de migracao do protocolo de jobs (ultimos 7 dias)
        </p>
      </div>

      {/* Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Status Geral da Migracao
          </CardTitle>
          <CardDescription>Progresso de adocao do protocolo v3 (submit-job-result)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Adocao v3</span>
              <span className={`text-sm font-bold ${getStatusColor(migrationStats.v3Percentage)}`}>
                {migrationStats.v3Jobs} / {migrationStats.total} ({migrationStats.v3Percentage.toFixed(1)}%)
              </span>
            </div>
            <Progress value={migrationStats.v3Percentage} className="h-3" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">Jobs v3</span>
              </div>
              <div className="text-2xl font-bold text-success">{migrationStats.v3Jobs}</div>
            </div>
            <div className="border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-xs text-muted-foreground">Jobs v1</span>
              </div>
              <div className="text-2xl font-bold text-warning">{migrationStats.v1Jobs}</div>
            </div>
            <div className="border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total</span>
              </div>
              <div className="text-2xl font-bold">{migrationStats.total}</div>
            </div>
          </div>

          {/* Alert baseado no status */}
          {migrationStats.v3Percentage < 50 && (
            <div className="flex items-start gap-2 p-3 border border-destructive/50 bg-destructive/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Migracao Abaixo do Esperado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Menos de 50% dos jobs estao usando v3. Verifique logs dos agentes e Edge Function submit-job-result.
                </p>
              </div>
            </div>
          )}

          {migrationStats.v3Percentage >= 50 && migrationStats.v3Percentage < 80 && (
            <div className="flex items-start gap-2 p-3 border border-warning/50 bg-warning/20 rounded-lg">
              <Activity className="h-5 w-5 text-warning mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">Migracao em Progresso</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {migrationStats.v3Percentage.toFixed(1)}% dos jobs usam v3. Continue monitorando o rollout.
                </p>
              </div>
            </div>
          )}

          {migrationStats.v3Percentage >= 80 && (
            <div className="flex items-start gap-2 p-3 border border-success/50 bg-success/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-success">Migracao Bem-Sucedida</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {migrationStats.v3Percentage.toFixed(1)}% dos jobs usam v3. Sistema operando no novo protocolo.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Status por Agente</CardTitle>
          <CardDescription>Detalhamento da adocao v3 por agente individual</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">Total Jobs</TableHead>
                <TableHead className="text-right">v3</TableHead>
                <TableHead className="text-right">v1</TableHead>
                <TableHead className="text-right">% v3</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {migrationStats.agentStats.map((agent) => (
                <TableRow key={agent.agent_name}>
                  <TableCell className="font-medium">{agent.agent_name}</TableCell>
                  <TableCell className="text-right">{agent.total_jobs}</TableCell>
                  <TableCell className="text-right text-success">{agent.v3_jobs}</TableCell>
                  <TableCell className="text-right text-warning">{agent.v1_jobs}</TableCell>
                  <TableCell className="text-right">
                    <span className={getStatusColor(agent.v3_percentage)}>
                      {agent.v3_percentage.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(agent.v3_percentage)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {migrationStats.agentStats.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum job executado nos ultimos 7 dias
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}