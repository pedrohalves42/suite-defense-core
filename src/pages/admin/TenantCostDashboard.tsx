import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, DollarSign, Users, Server } from 'lucide-react';

interface TenantCostData {
  tenant_id: string;
  tenant_name: string;
  plan_name: string;
  active_agents: number;
  max_agents: number;
  jobs_30d: number;
  failed_jobs_30d: number;
  failure_rate: number;
  estimated_cost_usd: number;
  status: string;
}

export default function TenantCostDashboard() {
  const { data: tenantCosts, isLoading } = useQuery({
    queryKey: ['tenant-cost-dashboard'],
    queryFn: async () => {
      // Get tenant subscriptions with plan info
      const { data: subs } = await supabase
        .from('tenant_subscriptions')
        .select(`
          tenant_id,
          status,
          subscription_plans!inner(name, max_agents)
        `);

      // Get tenant names
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name');

      // Get active agent counts per tenant
      const { data: agents } = await supabase
        .from('agents')
        .select('tenant_id, status')
        .eq('status', 'active');

      // Get job counts per tenant (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: jobs } = await supabase
        .from('jobs')
        .select('tenant_id, status')
        .gte('created_at', thirtyDaysAgo);

      const tenantMap = new Map(tenants?.map(t => [t.id, t.name]) || []);
      const agentCounts = new Map<string, number>();
      agents?.forEach(a => {
        agentCounts.set(a.tenant_id, (agentCounts.get(a.tenant_id) || 0) + 1);
      });

      const jobStats = new Map<string, { total: number; failed: number }>();
      jobs?.forEach(j => {
        const stats = jobStats.get(j.tenant_id) || { total: 0, failed: 0 };
        stats.total++;
        if (j.status === 'failed') stats.failed++;
        jobStats.set(j.tenant_id, stats);
      });

      const results: TenantCostData[] = (subs || []).map(sub => {
        const plan = sub.subscription_plans as unknown as { name: string; max_agents: number };
        const activeAgents = agentCounts.get(sub.tenant_id) || 0;
        const stats = jobStats.get(sub.tenant_id) || { total: 0, failed: 0 };
        const failureRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;

        // Estimated cost: ~$0.75/agent/month + $0.01/job
        const estimatedCost = (activeAgents * 0.75) + (stats.total * 0.01);

        return {
          tenant_id: sub.tenant_id,
          tenant_name: tenantMap.get(sub.tenant_id) || 'Unknown',
          plan_name: plan.name,
          active_agents: activeAgents,
          max_agents: plan.max_agents || 2,
          jobs_30d: stats.total,
          failed_jobs_30d: stats.failed,
          failure_rate: failureRate,
          estimated_cost_usd: estimatedCost,
          status: sub.status || 'unknown',
        };
      });

      return results.sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd);
    },
    staleTime: 5 * 60 * 1000,
  });

  const totalCost = tenantCosts?.reduce((sum, t) => sum + t.estimated_cost_usd, 0) || 0;
  const totalAgents = tenantCosts?.reduce((sum, t) => sum + t.active_agents, 0) || 0;
  const outliers = tenantCosts?.filter(t => t.plan_name === 'free' && t.active_agents > 2) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Custo por Tenant</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
            <p className="text-sm text-muted-foreground">Custo estimado/mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{tenantCosts?.length || 0}</div>
            <p className="text-sm text-muted-foreground">Tenants ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalAgents}</div>
            <p className="text-sm text-muted-foreground">Agentes ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{outliers.length}</div>
            <p className="text-sm text-muted-foreground">Outliers (free &gt; 2 agentes)</p>
          </CardContent>
        </Card>
      </div>

      {/* Outlier Alerts */}
      {outliers.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Tenants Outliers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outliers.map(t => (
              <div key={t.tenant_id} className="flex items-center justify-between py-2">
                <span className="font-medium">{t.tenant_name}</span>
                <Badge variant="destructive">{t.active_agents} agentes no plano free</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cost Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Detalhamento por Tenant
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Agentes</TableHead>
                  <TableHead className="text-right">Jobs/30d</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                  <TableHead className="text-right">Taxa Falha</TableHead>
                  <TableHead className="text-right">Custo Est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantCosts?.map(t => (
                  <TableRow key={t.tenant_id}>
                    <TableCell className="font-medium">{t.tenant_name}</TableCell>
                    <TableCell>
                      <Badge variant={t.plan_name === 'free' ? 'secondary' : 'default'}>
                        {t.plan_name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'active' ? 'default' : 'outline'}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.active_agents}/{t.max_agents}
                    </TableCell>
                    <TableCell className="text-right">{t.jobs_30d}</TableCell>
                    <TableCell className="text-right">{t.failed_jobs_30d}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={t.failure_rate > 30 ? 'destructive' : t.failure_rate > 15 ? 'secondary' : 'default'}>
                        {t.failure_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${t.estimated_cost_usd.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
