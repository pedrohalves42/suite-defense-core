import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  max_users: number;
  max_agents: number | null;
  max_scans_per_month: number | null;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  created_at: string;
  subscription_plans: SubscriptionPlan;
}

export interface TenantWithStats extends Tenant {
  subscription?: TenantSubscription;
  user_count?: number;
  agent_count?: number;
  scan_count?: number;
}

const PAGE_SIZE = 50;

export function useTenants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

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
    placeholderData: (previousData) => previousData,
  });

  const tenants = tenantsData?.tenants;
  const totalCount = tenantsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
      const uniqueUsers = new Map<string, Set<string>>();
      data.forEach((row) => {
        if (!uniqueUsers.has(row.tenant_id)) uniqueUsers.set(row.tenant_id, new Set());
        uniqueUsers.get(row.tenant_id)!.add(row.user_id);
      });
      const counts: Record<string, number> = {};
      uniqueUsers.forEach((userSet, tenantId) => { counts[tenantId] = userSet.size; });
      return counts;
    },
    enabled: !!tenants && tenants.length > 0,
  });

  const { data: agentCounts } = useQuery({
    queryKey: ['super-admin-agent-counts', page],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return {};
      const tenantIds = tenants.map(t => t.id);
      const { data, error } = await supabase
        .from('agents')
        .select('tenant_id')
        .in('tenant_id', tenantIds)
        .is('archived_at', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((row) => { counts[row.tenant_id] = (counts[row.tenant_id] || 0) + 1; });
      return counts;
    },
    enabled: !!tenants && tenants.length > 0,
  });

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
      data.forEach((row) => { limits[row.tenant_id] = row.quota_limit; });
      return limits;
    },
    enabled: !!tenants && tenants.length > 0,
  });

  const { data: totalStats } = useQuery({
    queryKey: ['super-admin-total-stats'],
    queryFn: async () => {
      const { data: userRoles, error: userError } = await supabase
        .from('user_roles')
        .select('user_id');
      if (userError) throw userError;
      const uniqueUserIds = new Set(userRoles?.map(r => r.user_id) || []);
      const { count: agentCount, error: agentError } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .is('archived_at', null);
      if (agentError) throw agentError;
      return { totalUsers: uniqueUserIds.size, totalAgents: agentCount || 0 };
    },
  });

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
      toast({ title: 'Success', description: 'Subscription plan updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: `Failed to update subscription: ${error.message}`, variant: 'destructive' });
    },
  });

  const tenantsWithStats: TenantWithStats[] = tenants?.map((tenant) => ({
    ...tenant,
    subscription: subscriptions?.find((s) => s.tenant_id === tenant.id),
    user_count: userCounts?.[tenant.id] || 0,
    agent_count: agentCounts?.[tenant.id] || 0,
  })) || [];

  return {
    tenantsWithStats,
    tenantsLoading,
    totalCount,
    totalPages,
    page,
    setPage,
    plans,
    tenantFeatures,
    totalStats,
    updateSubscription,
    PAGE_SIZE,
  };
}
