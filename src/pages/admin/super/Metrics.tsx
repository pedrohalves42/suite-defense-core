import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, AlertCircle, CheckCircle2, Shield, Users, Building2 } from 'lucide-react';

export default function SuperAdminMetrics() {
  // Fetch virus scan stats
  const { data: scanStats } = useQuery({
    queryKey: ['super-admin-scan-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('virus_scans')
        .select('is_malicious, scanned_at');
      
      if (error) throw error;

      const total = data.length;
      const malicious = data.filter(scan => scan.is_malicious).length;
      const clean = total - malicious;

      return { total, malicious, clean };
    },
  });

  // Fetch agent status stats
  const { data: agentStats } = useQuery({
    queryKey: ['super-admin-agent-stats'],
    queryFn: async () => {
      // ADR-026: Super-admin context — agents_safe is acceptable for cross-tenant aggregation
      const { data, error } = await supabase
        .from('agents_safe')
        .select('status, tenant_id')
        .is('archived_at', null);
      
      if (error) throw error;

      const byStatus = data.reduce((acc, agent) => {
        acc[agent.status] = (acc[agent.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total: data.length,
        active: byStatus.active || 0,
        inactive: byStatus.inactive || 0,
        offline: byStatus.offline || 0,
      };
    },
  });

  // Fetch user stats
  const { data: userStats } = useQuery({
    queryKey: ['super-admin-user-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, tenant_id');
      
      if (error) throw error;

      const byRole = data.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total: data.length,
        admins: byRole.admin || 0,
        operators: byRole.operator || 0,
        viewers: byRole.viewer || 0,
        super_admins: byRole.super_admin || 0,
      };
    },
  });

  // Fetch tenant stats
  const { data: tenantStats } = useQuery({
    queryKey: ['super-admin-tenant-stats'],
    queryFn: async () => {
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id');
      
      if (tenantsError) throw tenantsError;

      const { data: subscriptions, error: subsError } = await supabase
        .from('tenant_subscriptions')
        .select('plan_id, subscription_plans(name)');
      
      if (subsError) throw subsError;

      const planCounts = subscriptions.reduce((acc, sub: any) => {
        const planName = sub.subscription_plans.name;
        acc[planName] = (acc[planName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total: tenants.length,
        free: planCounts.free || 0,
        starter: planCounts.starter || 0,
        pro: planCounts.pro || 0,
        scale: planCounts.scale || 0,
        enterprise: planCounts.enterprise || 0,
      };
    },
  });

  const scanChartData = [
    { name: 'Limpos', value: scanStats?.clean || 0, color: 'hsl(var(--primary))' },
    { name: 'Maliciosos', value: scanStats?.malicious || 0, color: 'hsl(var(--destructive))' },
  ];

  const agentChartData = [
    { name: 'Ativos', value: agentStats?.active || 0 },
    { name: 'Inativos', value: agentStats?.inactive || 0 },
    { name: 'Offline', value: agentStats?.offline || 0 },
  ];

  const planChartData = [
    { name: 'Gratuito', value: tenantStats?.free || 0, color: 'hsl(var(--secondary))' },
    { name: 'Starter', value: tenantStats?.starter || 0, color: 'hsl(var(--muted))' },
    { name: 'Business', value: tenantStats?.pro || 0, color: 'hsl(var(--primary))' },
    { name: 'Scale', value: tenantStats?.scale || 0, color: 'hsl(var(--accent))' },
    { name: 'Enterprise', value: tenantStats?.enterprise || 0, color: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Métricas Globais</h1>
        <p className="text-muted-foreground">Estatísticas e análises de todo o sistema</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenantStats?.total || 0}</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="secondary">Gratuito: {tenantStats?.free || 0}</Badge>
              <Badge variant="outline">Starter: {tenantStats?.starter || 0}</Badge>
              <Badge>Business: {tenantStats?.pro || 0}</Badge>
              <Badge variant="default">Scale: {tenantStats?.scale || 0}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Administradores: {userStats?.admins || 0} | Operadores: {userStats?.operators || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Computadores</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agentStats?.total || 0}</div>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>{agentStats?.active || 0} Ativos</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verificações de Vírus</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scanStats?.total || 0}</div>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span>{scanStats?.malicious || 0} Ameaças Detectadas</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resultados das Verificações</CardTitle>
            <CardDescription>Distribuição de arquivos limpos vs maliciosos</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={scanChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {scanChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos Computadores</CardTitle>
            <CardDescription>Status atual de todos os computadores registrados</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agentChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Planos</CardTitle>
            <CardDescription>Empresas por tipo de plano de assinatura</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={planChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {planChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funções dos Usuários</CardTitle>
            <CardDescription>Distribuição de usuários por função</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Administradores</span>
                <Badge>{userStats?.admins || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Operadores</span>
                <Badge variant="secondary">{userStats?.operators || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Visualizadores</span>
                <Badge variant="outline">{userStats?.viewers || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Super Admins</span>
                <Badge variant="destructive">{userStats?.super_admins || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
