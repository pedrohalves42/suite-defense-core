import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { tenantQuery } from '@/lib/tenantQuery';
import { toast } from 'sonner';
import type { SecurityPolicy } from '@/types/security-policies';
import type { Json } from '@/integrations/supabase/types';

export const useSecurityPolicies = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: policies = [], isLoading: policiesLoading } = useQuery({
    queryKey: ['security-policies', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await tenantQuery('security_policies', tenant.id)
        .select('id, tenant_id, name, description, enabled, is_active, priority, created_at, updated_at, created_by, approved_by, approved_at')
        .order('priority', { ascending: false });
      
      if (error) throw error;
      return data as SecurityPolicy[];
    },
    enabled: !!tenant?.id,
  });

  const createPolicy = useMutation({
    mutationFn: async (policy: Omit<SecurityPolicy, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('security_policies')
        .insert(policy)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      toast.success('Política criada com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao criar política: ${error.message}`);
    },
  });

  const updatePolicy = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SecurityPolicy> & { id: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1032 FIX: Add tenant_id filter
      const { data, error } = await supabase
        .from('security_policies')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      toast.success('Política atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar política: ${error.message}`);
    },
  });

  const deletePolicy = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1032 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('security_policies')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      toast.success('Política excluída');
    },
    onError: (error) => {
      toast.error(`Erro ao excluir política: ${error.message}`);
    },
  });

  return {
    policies,
    loading: policiesLoading,
    createPolicy,
    updatePolicy,
    deletePolicy,
  };
};

export const usePolicyRules = (policyId: string | null) => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['policy-rules', policyId],
    queryFn: async () => {
      if (!policyId) return [];
      
      const { data, error } = await supabase
        .from('security_policy_rules')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!policyId,
  });

  const createRule = useMutation({
    mutationFn: async (rule: {
      policy_id: string;
      rule_type: string;
      action: string;
      target: string;
      conditions?: Json;
      is_enabled?: boolean;
    }) => {
      if (!tenant?.id) throw new Error('Tenant não selecionado');
      const { data, error } = await supabase
        .from('security_policy_rules')
        .insert({ ...rule, tenant_id: tenant.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-rules', policyId] });
      toast.success('Regra criada');
    },
    onError: (error) => {
      toast.error(`Erro ao criar regra: ${error.message}`);
    },
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; is_enabled?: boolean; action?: string; target?: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1032 FIX: Add tenant_id filter
      const { data, error } = await supabase
        .from('security_policy_rules')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-rules', policyId] });
      toast.success('Regra atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar regra: ${error.message}`);
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1032 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('security_policy_rules')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-rules', policyId] });
      toast.success('Regra excluída');
    },
    onError: (error) => {
      toast.error(`Erro ao excluir regra: ${error.message}`);
    },
  });

  return {
    rules,
    loading: isLoading,
    createRule,
    updateRule,
    deleteRule,
  };
};

export const useAgentGroupPolicies = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: groupPolicies = [], isLoading } = useQuery({
    queryKey: ['agent-group-policies', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('agent_group_policies')
        .select(`
          *,
          agent_groups!inner(id, name, tenant_id),
          security_policies!inner(id, name, tenant_id)
        `)
        .eq('agent_groups.tenant_id', tenant.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const assignPolicy = useMutation({
    mutationFn: async ({ group_id, policy_id, tenant_id }: { group_id: string; policy_id: string; tenant_id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('agent_group_policies')
        .insert({
          group_id,
          policy_id,
          assigned_by: user?.id,
          tenant_id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-group-policies'] });
      toast.success('Política atribuída ao grupo');
    },
    onError: (error) => {
      toast.error(`Erro ao atribuir política: ${error.message}`);
    },
  });

  const unassignPolicy = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1032 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('agent_group_policies')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-group-policies'] });
      toast.success('Política removida do grupo');
    },
    onError: (error) => {
      toast.error(`Erro ao remover política: ${error.message}`);
    },
  });

  return {
    groupPolicies,
    loading: isLoading,
    assignPolicy,
    unassignPolicy,
  };
};
