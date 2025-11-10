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
      const { data, error } = await supabase
        .from('agents')
        .select('status, tenant_id');
      
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
        pro: planCounts.pro || 0,
        enterprise: planCounts.enterprise || 0,
      };
    },
  });

  const scanChartData = [
    { name: 'Clean', value: scanStats?.clean || 0, color: 'hsl(var(--primary))' },
    { name: 'Malicious', value: scanStats?.malicious || 0, color: 'hsl(var(--destructive))' },
  ];

  const agentChartData = [
    { name: 'Active', value: agentStats?.active || 0 },
    { name: 'Inactive', value: agentStats?.inactive || 0 },
    { name: 'Offline', value: agentStats?.offline || 0 },
  ];

  const planChartData = [
    { name: 'Free', value: tenantStats?.free || 0, color: 'hsl(var(--secondary))' },
    { name: 'Pro', value: tenantStats?.pro || 0, color: 'hsl(var(--primary))' },
    { name: 'Enterprise', value: tenantStats?.enterprise || 0, color: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Global Metrics</h1>
        <p className="text-muted-foreground">System-wide statistics and analytics</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenantStats?.total || 0}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary">Free: {tenantStats?.free || 0}</Badge>
              <Badge>Pro: {tenantStats?.pro || 0}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Admins: {userStats?.admins || 0} | Operators: {userStats?.operators || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agentStats?.total || 0}</div>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>{agentStats?.active || 0} Active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Virus Scans</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scanStats?.total || 0}</div>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span>{scanStats?.malicious || 0} Threats Detected</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Virus Scan Results</CardTitle>
            <CardDescription>Distribution of clean vs malicious files</CardDescription>
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
            <CardTitle>Agent Status Distribution</CardTitle>
            <CardDescription>Current status of all registered agents</CardDescription>
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
            <CardTitle>Subscription Plans</CardTitle>
            <CardDescription>Distribution of tenants by plan type</CardDescription>
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
            <CardTitle>User Roles</CardTitle>
            <CardDescription>Distribution of users by role</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Admins</span>
                <Badge>{userStats?.admins || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Operators</span>
                <Badge variant="secondary">{userStats?.operators || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Viewers</span>
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
