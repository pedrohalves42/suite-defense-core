import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AgentTag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AgentTagAssignment {
  id: string;
  agent_id: string;
  tag_id: string;
  assigned_by: string | null;
  created_at: string;
}

export const useAgentTags = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['agent-tags', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('agent_tags')
        .select('id, tenant_id, name, color, description, created_at')
        .eq('tenant_id', tenant.id)
        .order('name');
      if (error) throw error;
      return data as AgentTag[];
    },
    enabled: !!tenant?.id,
  });
};

export const useAgentTagAssignments = (agentId?: string) => {
  return useQuery({
    queryKey: ['agent-tag-assignments', agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await supabase
        .from('agent_tag_assignments')
        .select('*, agent_tags(*)')
        .eq('agent_id', agentId);
      if (error) throw error;
      return data;
    },
    enabled: !!agentId,
  });
};

export const useCreateTag = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (tag: { name: string; color: string; description?: string }) => {
      if (!tenant?.id) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('agent_tags')
        .insert({
          ...tag,
          tenant_id: tenant.id,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tags'] });
      toast.success('Tag criada com sucesso');
    },
    onError: (error: Record<string, unknown>) => {
      if (error?.code === '23505') {
        toast.error('Já existe uma tag com esse nome');
      } else {
        toast.error('Erro ao criar tag');
      }
    },
  });
};

export const useUpdateTag = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; color?: string; description?: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1046 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('agent_tags')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tags'] });
      toast.success('Tag atualizada');
    },
    onError: () => toast.error('Erro ao atualizar tag'),
  });
};

export const useDeleteTag = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tagId: string) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1046 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('agent_tags')
        .delete()
        .eq('id', tagId)
        .eq('tenant_id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tags'] });
      queryClient.invalidateQueries({ queryKey: ['agent-tag-assignments'] });
      toast.success('Tag removida');
    },
    onError: () => toast.error('Erro ao remover tag'),
  });
};

export const useAssignTag = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ agentId, tagId, tenantId }: { agentId: string; tagId: string; tenantId: string }) => {
      const { error } = await supabase
        .from('agent_tag_assignments')
        .insert({ agent_id: agentId, tag_id: tagId, assigned_by: user?.id, tenant_id: tenantId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tag-assignments'] });
      toast.success('Tag atribuída');
    },
    onError: (error: Record<string, unknown>) => {
      if (error?.code === '23505') {
        toast.info('Tag já atribuída');
      } else {
        toast.error('Erro ao atribuir tag');
      }
    },
  });
};

export const useRemoveTagAssignment = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, tagId }: { agentId: string; tagId: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1046 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('agent_tag_assignments')
        .delete()
        .eq('agent_id', agentId)
        .eq('tag_id', tagId)
        .eq('tenant_id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tag-assignments'] });
      toast.success('Tag removida do agente');
    },
    onError: () => toast.error('Erro ao remover tag'),
  });
};
