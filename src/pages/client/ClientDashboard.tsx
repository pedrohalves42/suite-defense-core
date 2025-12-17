import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Monitor, 
  ShieldCheck, 
  AlertTriangle, 
  Activity,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

export const ClientDashboard = () => {
  const { tenant } = useTenant();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['client-dashboard-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Fetch agents
      const { data: agents } = await supabase
        .from('agents')
        .select('id, status, last_heartbeat, agent_name')
        .eq('tenant_id', tenant.id);

      // Fetch recent alerts
      const { data: alerts } = await supabase
        .from('system_alerts')
        .select('id, alert_type, severity, resolved')
        .eq('tenant_id', tenant.id)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch recent reports
      const { data: reports } = await supabase
        .from('generated_reports')
        .select('id, title, created_at, risk_score')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch vulnerability count
      const { count: vulnCount } = await supabase
        .from('vuln_findings')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      const onlineAgents = agents?.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) > fiveMinutesAgo
      ).length || 0;

      const offlineAgents = (agents?.length || 0) - onlineAgents;

      return {
        totalAgents: agents?.length || 0,
        onlineAgents,
        offlineAgents,
        unresolvedAlerts: alerts?.length || 0,
        criticalAlerts: alerts?.filter(a => a.severity === 'critical').length || 0,
        recentReports: reports || [],
        vulnerabilities: vulnCount || 0
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao CyberShield</h1>
        <p className="text-muted-foreground">
          Veja o status de segurança dos seus computadores
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Computadores
            </CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAgents || 0}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {stats?.onlineAgents || 0} online
              </Badge>
              {(stats?.offlineAgents || 0) > 0 && (
                <Badge variant="secondary" className="bg-muted">
                  <XCircle className="h-3 w-3 mr-1" />
                  {stats.offlineAgents} offline
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alertas Ativos
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.unresolvedAlerts || 0}</div>
            {(stats?.criticalAlerts || 0) > 0 ? (
              <p className="text-xs text-destructive">
                {stats.criticalAlerts} crítico(s) requer atenção
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum alerta crítico
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vulnerabilidades
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.vulnerabilities || 0}</div>
            <p className="text-xs text-muted-foreground">
              Encontradas nos seus computadores
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status Geral
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(stats?.criticalAlerts || 0) > 0 ? (
              <>
                <div className="text-2xl font-bold text-destructive">Atenção</div>
                <p className="text-xs text-muted-foreground">
                  Existem alertas que precisam de ação
                </p>
              </>
            ) : (stats?.unresolvedAlerts || 0) > 0 ? (
              <>
                <div className="text-2xl font-bold text-yellow-600">Moderado</div>
                <p className="text-xs text-muted-foreground">
                  Alguns alertas para revisar
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">Protegido</div>
                <p className="text-xs text-muted-foreground">
                  Tudo funcionando normalmente
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Relatórios Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentReports && stats.recentReports.length > 0 ? (
            <div className="space-y-3">
              {stats.recentReports.map((report: any) => (
                <div 
                  key={report.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{report.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatBrazilDateTime(report.created_at)}
                    </p>
                  </div>
                  {report.risk_score !== null && (
                    <Badge 
                      variant={report.risk_score >= 60 ? 'destructive' : report.risk_score >= 30 ? 'secondary' : 'default'}
                    >
                      Risco: {report.risk_score}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nenhum relatório gerado ainda
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
