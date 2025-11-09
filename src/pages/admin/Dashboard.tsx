import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/useTenant';
import { Activity, Shield, Users, Server, AlertTriangle, CheckCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Stats {
  totalAgents: number;
  activeAgents: number;
  offlineAgents: number;
  totalScans: number;
  maliciousFiles: number;
  cleanFiles: number;
  quarantinedFiles: number;
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  failedJobs: number;
}

export default function Dashboard() {
  const { tenant } = useTenant();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['tenant-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const [agents, scans, quarantine, jobs] = await Promise.all([
        // Agents
        supabase
          .from('agents')
          .select('status, last_heartbeat')
          .eq('tenant_id', tenant.id),
        
        // Virus Scans
        supabase
          .from('virus_scans')
          .select('is_malicious')
          .eq('tenant_id', tenant.id),
        
        // Quarantined Files
        supabase
          .from('quarantined_files')
          .select('status')
          .eq('tenant_id', tenant.id),
        
        // Jobs
        supabase
          .from('jobs')
          .select('status')
          .eq('tenant_id', tenant.id)
      ]);

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const activeAgents = agents.data?.filter(a => 
        a.status === 'active' && 
        a.last_heartbeat && 
        new Date(a.last_heartbeat) > fiveMinutesAgo
      ).length || 0;

      const stats: Stats = {
        totalAgents: agents.data?.length || 0,
        activeAgents,
        offlineAgents: (agents.data?.length || 0) - activeAgents,
        totalScans: scans.data?.length || 0,
        maliciousFiles: scans.data?.filter(s => s.is_malicious).length || 0,
        cleanFiles: scans.data?.filter(s => !s.is_malicious).length || 0,
        quarantinedFiles: quarantine.data?.filter(q => q.status === 'quarantined').length || 0,
        totalJobs: jobs.data?.length || 0,
        completedJobs: jobs.data?.filter(j => j.status === 'completed').length || 0,
        pendingJobs: jobs.data?.filter(j => j.status === 'queued' || j.status === 'delivered').length || 0,
        failedJobs: jobs.data?.filter(j => j.status === 'failed').length || 0,
      };

      return stats;
    },
    enabled: !!tenant?.id,
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: recentScans, isLoading: scansLoading } = useQuery({
    queryKey: ['recent-scans', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('virus_scans')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('scanned_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Dashboard de Estatísticas</h2>
        <p className="text-muted-foreground">
          Visão geral do tenant {tenant?.name}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAgents || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeAgents || 0} ativos, {stats?.offlineAgents || 0} offline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scans Realizados</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalScans || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.maliciousFiles || 0} maliciosos, {stats?.cleanFiles || 0} limpos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Arquivos em Quarentena</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.quarantinedFiles || 0}</div>
            <p className="text-xs text-muted-foreground">
              Arquivos isolados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalJobs || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.completedJobs || 0} concluídos, {stats?.pendingJobs || 0} pendentes
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scans */}
        <Card>
          <CardHeader>
            <CardTitle>Scans Recentes</CardTitle>
            <CardDescription>Últimos 5 scans de vírus realizados</CardDescription>
          </CardHeader>
          <CardContent>
            {scansLoading ? (
              <div className="text-center py-4">Carregando...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentScans?.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-medium">
                        {scan.file_path.split('/').pop()}
                      </TableCell>
                      <TableCell>
                        {scan.is_malicious ? (
                          <Badge variant="destructive">
                            Malicioso ({scan.positives}/{scan.total_scans})
                          </Badge>
                        ) : (
                          <Badge variant="default">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Limpo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(scan.scanned_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!recentScans || recentScans.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhum scan realizado ainda
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>Últimas 10 ações no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="text-center py-4">Carregando...</div>
            ) : (
              <div className="space-y-3">
                {recentActivity?.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.resource_type} {activity.resource_id && `· ${activity.resource_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(activity.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Badge variant={activity.success ? 'default' : 'destructive'} className="shrink-0">
                      {activity.success ? 'Sucesso' : 'Erro'}
                    </Badge>
                  </div>
                ))}
                {(!recentActivity || recentActivity.length === 0) && (
                  <div className="text-center text-muted-foreground py-4">
                    Nenhuma atividade registrada
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health Status */}
      <Card>
        <CardHeader>
          <CardTitle>Status de Saúde do Sistema</CardTitle>
          <CardDescription>Indicadores de saúde do seu tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              {(stats?.activeAgents || 0) > 0 ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">Agentes Ativos</p>
                <p className="text-sm text-muted-foreground">
                  {(stats?.activeAgents || 0) > 0 ? 'Sistema operacional' : 'Nenhum agente ativo'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border rounded-lg">
              {(stats?.maliciousFiles || 0) === 0 ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="font-medium">Ameaças Detectadas</p>
                <p className="text-sm text-muted-foreground">
                  {(stats?.maliciousFiles || 0) === 0 ? 'Nenhuma ameaça' : `${stats?.maliciousFiles} ameaças`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border rounded-lg">
              {(stats?.failedJobs || 0) === 0 ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">Jobs Falhados</p>
                <p className="text-sm text-muted-foreground">
                  {(stats?.failedJobs || 0) === 0 ? 'Todos executados' : `${stats?.failedJobs} falharam`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
