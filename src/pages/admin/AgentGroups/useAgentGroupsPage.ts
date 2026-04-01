import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAgentGroups, useAgentGroupMembers, useAvailableAgents } from '@/hooks/useAgentGroups';
import { useAgentGroupPolicies } from '@/hooks/useSecurityPolicies';
import { useAuditLog } from '@/hooks/useAuditLog';
import { needsHighImpactConfirmation } from '@/components/ui/high-impact-confirm-dialog';

export function useAgentGroupsPage() {
  const { groups, memberCounts, isLoading, createGroup, updateGroup, deleteGroup } = useAgentGroups();
  const { groupPolicies } = useAgentGroupPolicies();
  const { logHighImpactAction } = useAuditLog();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const policyCountsByGroup = groupPolicies.reduce((acc, gp: any) => {
    const groupId = gp.agent_groups?.id || gp.group_id;
    acc[groupId] = acc[groupId] || { count: 0, names: [] };
    acc[groupId].count++;
    const policyName = gp.security_policies?.name;
    if (policyName) acc[groupId].names.push(policyName);
    return acc;
  }, {} as Record<string, { count: number; names: string[] }>);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddAgentsOpen, setIsAddAgentsOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [createSearchTerm, setCreateSearchTerm] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [createSelectedAgentIds, setCreateSelectedAgentIds] = useState<string[]>([]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const { members, isLoading: membersLoading, addAgents, removeAgent } = useAgentGroupMembers(selectedGroupId);
  const { agents: availableAgents, isLoading: availableLoading } = useAvailableAgents(selectedGroupId);
  const { agents: allAgents, isLoading: allAgentsLoading } = useAvailableAgents(null);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    const newGroup = await createGroup.mutateAsync({ name: groupName, description: groupDescription || undefined });
    if (createSelectedAgentIds.length > 0 && newGroup?.id) {
      const tenantId = (newGroup as Record<string, unknown>).tenant_id as string;
      const inserts = createSelectedAgentIds.map(agent_id => ({ agent_id, group_id: newGroup.id, tenant_id: tenantId }));
      await supabase.from('agents_groups').insert(inserts);
    }
    setGroupName(''); setGroupDescription(''); setCreateSelectedAgentIds([]); setCreateSearchTerm(''); setIsCreateOpen(false);
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroupId || !groupName.trim()) return;
    await updateGroup.mutateAsync({ id: selectedGroupId, name: groupName, description: groupDescription });
    setIsEditOpen(false);
  };

  const executeDeleteGroup = async () => {
    if (!selectedGroupId) return;
    const memberCount = memberCounts[selectedGroupId] || 0;
    const group = groups.find(g => g.id === selectedGroupId);
    await logHighImpactAction('agent_group', selectedGroupId, 'delete', {
      impactCount: memberCount, impactType: 'computers',
      thresholdExceeded: needsHighImpactConfirmation(memberCount),
      targetResourceName: group?.name,
    });
    await deleteGroup.mutateAsync(selectedGroupId);
    setSelectedGroupId(null); setIsDeleteConfirmOpen(false);
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroupId) return;
    const memberCount = memberCounts[selectedGroupId] || 0;
    if (needsHighImpactConfirmation(memberCount)) { setIsDeleteConfirmOpen(true); return; }
    await executeDeleteGroup();
  };

  const handleAddAgents = async () => {
    if (selectedAgentIds.length === 0) return;
    await addAgents.mutateAsync(selectedAgentIds);
    setSelectedAgentIds([]); setIsAddAgentsOpen(false);
  };

  const openEditDialog = () => {
    if (selectedGroup) {
      setGroupName(selectedGroup.name);
      setGroupDescription(selectedGroup.description || '');
      setIsEditOpen(true);
    }
  };

  const filteredAvailableAgents = availableAgents.filter(agent => {
    const search = searchTerm.toLowerCase();
    return agent.agent_name?.toLowerCase().includes(search) || agent.display_name?.toLowerCase().includes(search) || agent.hostname?.toLowerCase().includes(search);
  });

  const filteredAllAgents = allAgents.filter(agent => {
    const search = createSearchTerm.toLowerCase();
    return agent.agent_name?.toLowerCase().includes(search) || agent.display_name?.toLowerCase().includes(search) || agent.hostname?.toLowerCase().includes(search);
  });

  const toggleCreateAgentSelection = (agentId: string) => {
    setCreateSelectedAgentIds(prev => prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]);
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev => prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]);
  };

  return {
    groups, memberCounts, isLoading, policyCountsByGroup,
    selectedGroupId, setSelectedGroupId, selectedGroup,
    isCreateOpen, setIsCreateOpen, isEditOpen, setIsEditOpen,
    isAddAgentsOpen, setIsAddAgentsOpen, isDeleteConfirmOpen, setIsDeleteConfirmOpen,
    searchTerm, setSearchTerm, createSearchTerm, setCreateSearchTerm,
    groupName, setGroupName, groupDescription, setGroupDescription,
    selectedAgentIds, createSelectedAgentIds,
    members, membersLoading, removeAgent, addAgents,
    availableLoading, allAgentsLoading,
    filteredAvailableAgents, filteredAllAgents,
    createGroup, updateGroup,
    handleCreateGroup, handleUpdateGroup, handleDeleteGroup, executeDeleteGroup,
    handleAddAgents, openEditDialog,
    toggleCreateAgentSelection, toggleAgentSelection,
  };
}
