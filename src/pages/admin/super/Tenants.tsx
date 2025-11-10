import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Activity } from 'lucide-react';

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

  // Fetch user counts per tenant
  const { data: userCounts } = useQuery({
    queryKey: ['super-admin-user-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('tenant_id');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        counts[row.tenant_id] = (counts[row.tenant_id] || 0) + 1;
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Tenant Management</h1>
        <p className="text-muted-foreground">Manage all tenants and their subscription plans</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(userCounts || {}).reduce((a, b) => a + b, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(agentCounts || {}).reduce((a, b) => a + b, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
          <CardDescription>View and manage subscription plans for all tenants</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Change Plan</TableHead>
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
                      <Badge variant="outline">No Plan</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {tenant.user_count}/{tenant.subscription?.subscription_plans.max_users || 0}
                  </TableCell>
                  <TableCell>
                    {tenant.agent_count}/{tenant.subscription?.subscription_plans.max_agents || 'unlimited'}
                  </TableCell>
                  <TableCell>{new Date(tenant.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Select
                      value={tenant.subscription?.plan_id}
                      onValueChange={(value) =>
                        updateSubscription.mutate({ tenantId: tenant.id, planId: value })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Select plan" />
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
