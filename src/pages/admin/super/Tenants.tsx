import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Activity, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  max_users: number;
  max_agents: number | null;
  max_scans_per_month: number | null;
}

interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  created_at: string;
  subscription_plans: SubscriptionPlan;
}

interface TenantWithStats extends Tenant {
  subscription?: TenantSubscription;
  user_count?: number;
  agent_count?: number;
  scan_count?: number;
}

export default function SuperAdminTenants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all tenants
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Tenant[];
    },
  });

  // Fetch all subscriptions
  const { data: subscriptions } = useQuery({
    queryKey: ['super-admin-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select('*, subscription_plans(*)');
      
      if (error) throw error;
      return data as TenantSubscription[];
    },
  });

  // Fetch all plans
  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('max_users', { ascending: true });
      
      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });

  // Fetch user counts per tenant (COUNT DISTINCT user_id)
  const { data: userCounts } = useQuery({
    queryKey: ['super-admin-user-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('tenant_id, user_id');
      
      if (error) throw error;
      
      // Usar Map<tenant_id, Set<user_id>> para contar usuários únicos
      const uniqueUsers = new Map<string, Set<string>>();
      
      data.forEach((row) => {
        if (!uniqueUsers.has(row.tenant_id)) {
          uniqueUsers.set(row.tenant_id, new Set());
        }
        uniqueUsers.get(row.tenant_id)!.add(row.user_id);
      });
      
      // Converter para objeto { tenant_id: count }
      const counts: Record<string, number> = {};
      uniqueUsers.forEach((userSet, tenantId) => {
        counts[tenantId] = userSet.size;
      });
      
      return counts;
    },
  });

  // Fetch agent counts per tenant
  const { data: agentCounts } = useQuery({
    queryKey: ['super-admin-agent-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('tenant_id');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        counts[row.tenant_id] = (counts[row.tenant_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Mutation to update tenant subscription
  const updateSubscription = useMutation({
    mutationFn: async ({ tenantId, planId }: { tenantId: string; planId: string }) => {
      const { error } = await supabase
        .from('tenant_subscriptions')
        .update({ plan_id: planId })
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-subscriptions'] });
      toast({
        title: 'Success',
        description: 'Subscription plan updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update subscription: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Combine all data
  const tenantsWithStats: TenantWithStats[] = tenants?.map((tenant) => ({
    ...tenant,
    subscription: subscriptions?.find((s) => s.tenant_id === tenant.id),
    user_count: userCounts?.[tenant.id] || 0,
    agent_count: agentCounts?.[tenant.id] || 0,
  })) || [];

  const getPlanBadge = (planName: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      free: 'secondary',
      pro: 'default',
      enterprise: 'destructive',
    };
    return <Badge variant={variants[planName] || 'outline'}>{planName.toUpperCase()}</Badge>;
  };

  if (tenantsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Carregando dados dos tenants...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tenants || tenants.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum tenant encontrado no sistema.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Gerenciamento de Tenants</h1>
        <p className="text-muted-foreground">Visualize e gerencie todos os tenants e suas assinaturas</p>
      </div>

      <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Super Admin:</strong> Você tem acesso total para visualizar e modificar assinaturas de todos os tenants.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Organizações ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(userCounts || {}).reduce((a, b) => a + b, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Usuários em todos os tenants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Agentes</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(agentCounts || {}).reduce((a, b) => a + b, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Agentes monitorando servidores</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos os Tenants</CardTitle>
          <CardDescription>Visualize e altere os planos de assinatura de cada tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Tenant</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plano Atual</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Agentes</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Alterar Plano</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantsWithStats.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                  <TableCell>
                    {tenant.subscription ? (
                      getPlanBadge(tenant.subscription.subscription_plans.name)
                    ) : (
                      <Badge variant="outline">Sem Plano</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2" title="Usuários únicos com acesso ao tenant (independente de quantas roles possuem)">
                      <span className={tenant.user_count > (tenant.subscription?.subscription_plans.max_users || 0) ? 'text-red-600 font-semibold' : ''}>
                        {tenant.user_count}/{tenant.subscription?.subscription_plans.max_users || 0}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={tenant.agent_count > (tenant.subscription?.subscription_plans.max_agents || 999) ? 'text-red-600 font-semibold' : ''}>
                      {tenant.agent_count}/{tenant.subscription?.subscription_plans.max_agents || 'ilimitado'}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(tenant.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>
                    <Select
                      value={tenant.subscription?.plan_id}
                      onValueChange={(value) =>
                        updateSubscription.mutate({ tenantId: tenant.id, planId: value })
                      }
                      disabled={updateSubscription.isPending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans?.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
