import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/useTenant';
import { Activity, Shield, Users, Server, AlertTriangle, CheckCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBrazilDateTime, TIMEZONE_INDICATOR } from '@/lib/date-utils';
import { RecentAuditActivity } from '@/components/admin/RecentAuditActivity';
import { RecentJobsActivity } from '@/components/admin/RecentJobsActivity';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { OnboardingWizard } from '@/components/OnboardingWizard';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check for onboarding parameter
  useEffect(() => {
    const onboardingParam = searchParams.get('onboarding');
    if (onboardingParam === 'true') {
      setShowOnboarding(true);
      // Remove parameter from URL
      searchParams.delete('onboarding');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
        
        // Jobs - usar view normalizada para compatibilidade v1/v3
        supabase
          .from('jobs_normalized')
          .select('normalized_status, is_v3, duration_seconds')
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
        completedJobs: jobs.data?.filter(j => j.normalized_status === 'completed').length || 0,
        pendingJobs: jobs.data?.filter(j => ['queued', 'running'].includes(j.normalized_status || '')).length || 0,
        failedJobs: jobs.data?.filter(j => j.normalized_status === 'failed').length || 0,
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

  // Query para alertas criticos
  const { data: criticalAlerts } = useQuery({
    queryKey: ['critical-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .in('severity', ['critical', 'high'])
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000, // Atualizar a cada 30s
  });

  if (statsLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Card className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Dashboard de Estatisticas</h2>
        <p className="text-muted-foreground">
          Visao geral do tenant {tenant?.name}
        </p>
      </div>

      {/* Alertas Criticos */}
      {criticalAlerts && criticalAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-l-4 border-red-500 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/30 dark:to-transparent shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/30">
                  <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />
                </div>
                Alertas Criticos ({criticalAlerts.length})
              </CardTitle>
              <CardDescription>
                Requerem atencao imediata
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {criticalAlerts.map((alert, idx) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.1 }}
                  className="flex justify-between items-start p-3 bg-white dark:bg-gray-900 rounded-lg border hover:shadow-md transition-all duration-300"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{alert.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {alert.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatBrazilDateTime(alert.created_at, 'datetime')}
                    </div>
                  </div>
                  <Badge 
                    variant={alert.severity === 'critical' ? 'destructive' : 'default'}
                    className="ml-2"
                  >
                    {alert.severity}
                  </Badge>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent Activity & Jobs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              Atividade Recente
            </CardTitle>
            <CardDescription>Principais acoes de seguranca no seu tenant</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentAuditActivity tenantId={tenant?.id} />
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent/10">
                <Activity className="h-5 w-5 text-accent" />
              </div>
              Ultimos Jobs Executados
            </CardTitle>
            <CardDescription>Jobs recentes processados pelos agentes</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentJobsActivity tenantId={tenant?.id} />
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Agentes",
            icon: Server,
            value: stats?.totalAgents || 0,
            subtitle: `${stats?.activeAgents || 0} ativos, ${stats?.offlineAgents || 0} offline`,
            borderColor: "border-blue-500",
            gradient: "from-blue-50/50 dark:from-blue-950/30",
            iconBg: "bg-blue-100 dark:bg-blue-950/30",
            iconColor: "text-blue-500"
          },
          {
            title: "Scans Realizados",
            icon: Shield,
            value: stats?.totalScans || 0,
            subtitle: `${stats?.maliciousFiles || 0} maliciosos, ${stats?.cleanFiles || 0} limpos`,
            borderColor: "border-green-500",
            gradient: "from-green-50/50 dark:from-green-950/30",
            iconBg: "bg-green-100 dark:bg-green-950/30",
            iconColor: "text-green-500"
          },
          {
            title: "Arquivos em Quarentena",
            icon: AlertTriangle,
            value: stats?.quarantinedFiles || 0,
            subtitle: "Arquivos isolados",
            borderColor: "border-yellow-500",
            gradient: "from-yellow-50/50 dark:from-yellow-950/30",
            iconBg: "bg-yellow-100 dark:bg-yellow-950/30",
            iconColor: "text-yellow-500"
          },
          {
            title: "Jobs",
            icon: Activity,
            value: stats?.totalJobs || 0,
            subtitle: `${stats?.completedJobs || 0} concluidos, ${stats?.pendingJobs || 0} pendentes`,
            borderColor: "border-purple-500",
            gradient: "from-purple-50/50 dark:from-purple-950/30",
            iconBg: "bg-purple-100 dark:bg-purple-950/30",
            iconColor: "text-purple-500"
          }
        ].map((card, idx) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
          >
            <Card className={cn(
              "border-l-4 bg-gradient-to-br to-transparent hover:shadow-xl transition-all duration-300 hover:-translate-y-1",
              card.borderColor,
              card.gradient
            )}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <div className={cn("p-2 rounded-lg", card.iconBg)}>
                  <card.icon className={cn("h-5 w-5", card.iconColor)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-3xl font-bold", card.iconColor)}>
                  {card.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scans */}
        <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              Scans Recentes
            </CardTitle>
            <CardDescription>Ultimos 5 scans de virus realizados</CardDescription>
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
                        {formatBrazilDateTime(scan.scanned_at, 'short')}
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
        <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent/10">
                <Activity className="h-5 w-5 text-accent" />
              </div>
              Atividades Recentes
            </CardTitle>
            <CardDescription>Ultimas 10 acoes no sistema</CardDescription>
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
                        {activity.resource_type} {activity.resource_id && `? ${activity.resource_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBrazilDateTime(activity.created_at, 'datetime')}
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
      <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            Status de Saude do Sistema
          </CardTitle>
          <CardDescription>Indicadores de saude do seu tenant</CardDescription>
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
                <p className="font-medium">Ameacas Detectadas</p>
                <p className="text-sm text-muted-foreground">
                  {(stats?.maliciousFiles || 0) === 0 ? 'Nenhuma ameaca' : `${stats?.maliciousFiles} ameacas`}
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

      {/* Onboarding Wizard */}
      <OnboardingWizard 
        open={showOnboarding} 
        onComplete={() => setShowOnboarding(false)} 
      />
    </div>
  );
}
