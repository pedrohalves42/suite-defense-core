import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface AgentGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentGroupMember {
  agent_id: string;
  group_id: string;
}

export function useAgentGroups() {
  const { tenant, loading } = useTenant();
  const queryClient = useQueryClient();

  // Fetch all groups
  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: ['agent-groups', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('agent_groups')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name');
      if (error) throw error;
      return data as AgentGroup[];
    },
    enabled: !loading && !!tenant?.id,
  });

  // Fetch group members count
  const { data: memberCounts = {} } = useQuery({
    queryKey: ['agent-group-members-count', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return {};
      const { data, error } = await supabase
        .from('agents_groups')
        .select('group_id');
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(({ group_id }) => {
        counts[group_id] = (counts[group_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !loading && !!tenant?.id,
  });

  // Create group
  const createGroup = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      const { data, error } = await supabase
        .from('agent_groups')
        .insert({ tenant_id: tenant.id, name, description })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-groups'] });
      toast.success('Grupo criado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar grupo: ' + error.message);
    },
  });

  // Update group
  const updateGroup = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name?: string; description?: string }) => {
      const { error } = await supabase
        .from('agent_groups')
        .update({ name, description, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-groups'] });
      toast.success('Grupo atualizado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar grupo: ' + error.message);
    },
  });

  // Delete group
  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      // First remove all members
      await supabase.from('agents_groups').delete().eq('group_id', id);
      // Then delete the group
      const { error } = await supabase.from('agent_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-groups'] });
      queryClient.invalidateQueries({ queryKey: ['agent-group-members'] });
      toast.success('Grupo excluído');
    },
    onError: (error) => {
      toast.error('Erro ao excluir grupo: ' + error.message);
    },
  });

  return {
    groups,
    memberCounts,
    isLoading,
    error,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}

export function useAgentGroupMembers(groupId: string | null) {
  const queryClient = useQueryClient();

  // Fetch members of a group with agent details
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['agent-group-members', groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from('agents_groups')
        .select(`
          agent_id,
          group_id,
          agents:agent_id (
            id,
            agent_name,
            display_name,
            hostname,
            status,
            last_heartbeat
          )
        `)
        .eq('group_id', groupId);
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });

  // Add agents to group
  const addAgents = useMutation({
    mutationFn: async (agentIds: string[]) => {
      if (!groupId) throw new Error('Group not selected');
      if (!tenant?.id) throw new Error('Tenant not selected');
      const inserts = agentIds.map(agent_id => ({ agent_id, group_id: groupId, tenant_id: tenant.id }));
      const { error } = await supabase.from('agents_groups').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-group-members'] });
      queryClient.invalidateQueries({ queryKey: ['agent-group-members-count'] });
      toast.success('Computadores adicionados ao grupo');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar: ' + error.message);
    },
  });

  // Remove agent from group
  const removeAgent = useMutation({
    mutationFn: async (agentId: string) => {
      if (!groupId) throw new Error('Group not selected');
      const { error } = await supabase
        .from('agents_groups')
        .delete()
        .eq('group_id', groupId)
        .eq('agent_id', agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-group-members'] });
      queryClient.invalidateQueries({ queryKey: ['agent-group-members-count'] });
      toast.success('Computador removido do grupo');
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
    },
  });

  return {
    members,
    isLoading,
    addAgents,
    removeAgent,
  };
}

export function useAvailableAgents(groupId: string | null) {
  const { tenant, loading } = useTenant();

  // Fetch agents NOT in the current group using RPC for reliable tenant isolation
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['available-agents-for-group', tenant?.id, groupId],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // Use RPC get_agents_list instead of agents_safe view to avoid JWT claim issues
      const { data: allAgents, error: agentsError } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      
      if (agentsError) throw agentsError;

      // Map to expected format
      const mappedAgents = (allAgents || []).map((agent: any) => ({
        id: agent.id,
        agent_name: agent.agent_name,
        display_name: agent.display_name || agent.agent_name,
        hostname: agent.hostname,
        status: agent.status,
      }));

      if (!groupId) return mappedAgents;

      // Get agents already in this group
      const { data: groupMembers, error: membersError } = await supabase
        .from('agents_groups')
        .select('agent_id')
        .eq('group_id', groupId);
      if (membersError) throw membersError;

      const memberIds = new Set(groupMembers?.map(m => m.agent_id) || []);
      return mappedAgents.filter((agent: any) => !memberIds.has(agent.id));
    },
    enabled: !loading && !!tenant?.id,
  });

  return { agents, isLoading };
}
