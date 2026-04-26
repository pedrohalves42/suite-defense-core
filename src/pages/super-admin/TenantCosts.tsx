import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Server, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface TenantCostMetric {
  tenant_id: string;
  tenant_name: string;
  tenant_plan: string;
  active_agents: number;
  agent_limit: number;
  jobs_24h: number;
  jobs_7d: number;
  jobs_30d: number;
  failed_jobs_24h: number;
  abuse_alerts_7d: number;
  estimated_monthly_cost: number;
}

const useTenantCosts = () => {
  return useQuery({
    queryKey: ['tenant-cost-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tenant_cost_metrics');
      if (error) throw error;
      return (data as unknown as TenantCostMetric[]) || [];
    },
    refetchInterval: false, // FINOPS-012: Manual refresh only for cost transparency dashboards
  });
};

const planColors: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  starter: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pro: 'bg-primary/10 text-primary',
  business: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

export default function TenantCosts() {
  const { data: metrics, isLoading, refetch, isRefetching } = useTenantCosts();

  const totalCost = metrics?.reduce((sum, m) => sum + Number(m.estimated_monthly_cost), 0) ?? 0;
  const totalAgents = metrics?.reduce((sum, m) => sum + Number(m.active_agents), 0) ?? 0;
  const totalJobs30d = metrics?.reduce((sum, m) => sum + Number(m.jobs_30d), 0) ?? 0;
  const totalAbuse = metrics?.reduce((sum, m) => sum + Number(m.abuse_alerts_7d), 0) ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custo por Tenant</h1>
          <p className="text-muted-foreground">Monitoramento de uso e custos estimados por inquilino</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo Mensal Estimado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold text-foreground">${totalCost.toFixed(2)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agentes Ativos</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold text-foreground">{totalAgents}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jobs (30d)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold text-foreground">{totalJobs30d.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas de Abuso (7d)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className={`text-2xl font-bold ${totalAbuse > 0 ? 'text-destructive' : 'text-foreground'}`}>
                {totalAbuse}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tenant Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Tenant</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Agentes</TableHead>
                  <TableHead className="text-right">Jobs 24h</TableHead>
                  <TableHead className="text-right">Jobs 7d</TableHead>
                  <TableHead className="text-right">Jobs 30d</TableHead>
                  <TableHead className="text-right">Falhas 24h</TableHead>
                  <TableHead className="text-right">Alertas</TableHead>
                  <TableHead className="text-right">Custo Est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics?.map((m) => (
                  <TableRow key={m.tenant_id}>
                    <TableCell className="font-medium">{m.tenant_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={planColors[m.tenant_plan] ?? ''}>
                        {m.tenant_plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={Number(m.active_agents) > Number(m.agent_limit) ? 'text-destructive font-bold' : ''}>
                        {m.active_agents}
                      </span>
                      <span className="text-muted-foreground">/{m.agent_limit}</span>
                    </TableCell>
                    <TableCell className="text-right">{Number(m.jobs_24h).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(m.jobs_7d).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(m.jobs_30d).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={Number(m.failed_jobs_24h) > 10 ? 'text-destructive font-bold' : ''}>
                        {m.failed_jobs_24h}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(m.abuse_alerts_7d) > 0 ? (
                        <Badge variant="destructive">{m.abuse_alerts_7d}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      ${Number(m.estimated_monthly_cost).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {(!metrics || metrics.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhum tenant encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
