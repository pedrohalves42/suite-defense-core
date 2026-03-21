import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Activity, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatBrazilDateTime } from '@/lib/date-utils';

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
  
  // P0 FIX: Paginacao para evitar DoS com muitos tenants
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Fetch paginated tenants
  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['super-admin-tenants', page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      const { data, error, count } = await supabase
        .from('tenants')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      return { tenants: data as Tenant[], totalCount: count || 0 };
    },
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
  
  const tenants = tenantsData?.tenants;
  const totalCount = tenantsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch subscriptions only for current page tenants (P0 FIX)
  const { data: subscriptions } = useQuery({
    queryKey: ['super-admin-subscriptions', page],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return [];
      
      const tenantIds = tenants.map(t => t.id);
      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select('*, subscription_plans(*)')
        .in('tenant_id', tenantIds)
        .limit(PAGE_SIZE);
      
      if (error) throw error;
      return data as TenantSubscription[];
    },
    enabled: !!tenants && tenants.length > 0,
  });

  // Fetch all plans
  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, max_users, max_agents, max_devices, max_scans_per_month, price_per_device, stripe_price_id, billing_period, discount_pct, is_active, is_public, is_sales_only, trial_days, created_at')
        .order('max_users', { ascending: true });
      
      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });

  // Fetch user counts only for current page tenants (P0 FIX)
  const { data: userCounts } = useQuery({
    queryKey: ['super-admin-user-counts', page],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return {};
      
      const tenantIds = tenants.map(t => t.id);
      const { data, error } = await supabase
        .from('user_roles')
        .select('tenant_id, user_id')
        .in('tenant_id', tenantIds);
      
      if (error) throw error;
      
      // Usar Map<tenant_id, Set<user_id>> para contar usuarios unicos
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
    enabled: !!tenants && tenants.length > 0,
  });

  // Fetch agent counts only for current page tenants (P0 FIX)
  const { data: agentCounts } = useQuery({
    queryKey: ['super-admin-agent-counts', page],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return {};
      
      const tenantIds = tenants.map(t => t.id);
      // ADR-026 Zero-Gap: Use agents table directly with tenant filter (super-admin context)
      const { data, error } = await supabase
        .from('agents')
        .select('tenant_id')
        .in('tenant_id', tenantIds)
        .is('archived_at', null);
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        counts[row.tenant_id] = (counts[row.tenant_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!tenants && tenants.length > 0,
  });

  // Fetch tenant_features only for current page tenants (P0 FIX)
  const { data: tenantFeatures } = useQuery({
    queryKey: ['super-admin-tenant-features', page],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return {};
      
      const tenantIds = tenants.map(t => t.id);
      const { data, error } = await supabase
        .from('tenant_features')
        .select('tenant_id, feature_key, quota_limit')
        .eq('feature_key', 'max_users')
        .in('tenant_id', tenantIds);
      
      if (error) throw error;
      
      const limits: Record<string, number | null> = {};
      data.forEach((row) => {
        limits[row.tenant_id] = row.quota_limit;
      });
      
      return limits;
    },
    enabled: !!tenants && tenants.length > 0,
  });

  // P0 FIX: Queries agregadas para cards de resumo (totais gerais, nao apenas da pagina)
  const { data: totalStats } = useQuery({
    queryKey: ['super-admin-total-stats'],
    queryFn: async () => {
      // Count total unique users across all tenants
      const { data: userRoles, error: userError } = await supabase
        .from('user_roles')
        .select('user_id');
      
      if (userError) throw userError;
      const uniqueUserIds = new Set(userRoles?.map(r => r.user_id) || []);
      
      // Count total agents across all tenants (super-admin context)
      const { count: agentCount, error: agentError } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .is('archived_at', null);
      
      if (agentError) throw agentError;
      
      return {
        totalUsers: uniqueUserIds.size,
        totalAgents: agentCount || 0,
      };
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
          <strong>Super Admin:</strong> Voce tem acesso total para visualizar e modificar assinaturas de todos os tenants.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">Organizacoes ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuarios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalStats?.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Usuarios em todos os tenants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Computadores</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalStats?.totalAgents || 0}
            </div>
            <p className="text-xs text-muted-foreground">Computadores protegidos</p>
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
                <TableHead>Usuarios</TableHead>
                <TableHead>Computadores</TableHead>
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
                    <div className="flex items-center gap-2" title="Usuarios unicos com acesso ao tenant (fonte: tenant_features.max_users)">
                      {(() => {
                        const maxUsers = tenantFeatures?.[tenant.id] ?? tenant.subscription?.subscription_plans.max_users ?? 0;
                        const isOverLimit = maxUsers !== null && tenant.user_count > maxUsers;
                        return (
                          <span className={isOverLimit ? 'text-red-600 font-semibold' : ''}>
                            {tenant.user_count}/{maxUsers === null ? 'ilimitado' : maxUsers}
                          </span>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={tenant.agent_count > (tenant.subscription?.subscription_plans.max_agents || 999) ? 'text-red-600 font-semibold' : ''}>
                      {tenant.agent_count}/{tenant.subscription?.subscription_plans.max_agents || 'ilimitado'}
                    </span>
                  </TableCell>
                  <TableCell>{formatBrazilDateTime(tenant.created_at, 'date')}</TableCell>
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
          
          {/* P0 FIX: Controles de paginacao */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} tenants
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <div className="text-sm text-muted-foreground">
                  Pagina {page + 1} de {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Proxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
