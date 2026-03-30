import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSecurityPolicies, usePolicyRules, useAgentGroupPolicies } from '@/hooks/useSecurityPolicies';
import { useTenant } from '@/hooks/useTenant';
import { useAuditLog } from '@/hooks/useAuditLog';
import { needsHighImpactConfirmation } from '@/components/ui/high-impact-confirm-dialog';
import type { SecurityPolicy, RuleType, RuleAction } from '@/types/security-policies';
import type { AgentGroupWithCount, PolicyImpact } from '../types';

export function useSecurityPoliciesPage() {
  const { tenant } = useTenant();
  const { policies, loading, createPolicy, updatePolicy, deletePolicy } = useSecurityPolicies();
  const { groupPolicies, assignPolicy, unassignPolicy } = useAgentGroupPolicies();
  const { logHighImpactAction } = useAuditLog();

  const [selectedPolicy, setSelectedPolicy] = useState<SecurityPolicy | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [pendingAssignGroupId, setPendingAssignGroupId] = useState<string | null>(null);
  const [isAssignConfirmOpen, setIsAssignConfirmOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [policyDescription, setPolicyDescription] = useState('');
  const [policyPriority, setPolicyPriority] = useState(0);

  // Rule form state
  const [ruleType, setRuleType] = useState<RuleType>('website_block');
  const [ruleAction, setRuleAction] = useState<RuleAction>('block');
  const [ruleTarget, setRuleTarget] = useState('');

  const { rules, createRule, deleteRule } = usePolicyRules(selectedPolicy?.id || null);

  const { data: agentGroups = [] } = useQuery({
    queryKey: ['agent-groups-with-counts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data: groups, error } = await supabase
        .from('agent_groups')
        .select('id, name, description, tenant_id, created_at, updated_at')
        .eq('tenant_id', tenant.id);
      if (error) throw error;

      const groupsWithCounts = await Promise.all((groups || []).map(async (group) => {
        const { count } = await supabase
          .from('agents_groups')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);
        return { ...group, memberCount: count || 0 };
      }));

      return groupsWithCounts as AgentGroupWithCount[];
    },
    enabled: !!tenant?.id,
  });

  const getPolicyImpact = (): PolicyImpact => {
    if (!selectedPolicy) return { groups: 0, agents: 0 };
    const assignedGroups = groupPolicies.filter((gp: any) => gp.policy_id === selectedPolicy.id);
    let totalAgents = 0;
    assignedGroups.forEach((gp: any) => {
      const group = agentGroups.find(g => g.id === gp.group_id);
      if (group) totalAgents += Number(group.memberCount || 0);
    });
    return { groups: assignedGroups.length, agents: totalAgents };
  };

  const policyImpact = getPolicyImpact();

  const handleCreatePolicy = async () => {
    if (!tenant?.id || !policyName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    await createPolicy.mutateAsync({
      tenant_id: tenant.id,
      name: policyName,
      description: policyDescription || null,
      is_active: true,
      priority: policyPriority,
      created_by: user?.id || null,
    });
    setPolicyName('');
    setPolicyDescription('');
    setPolicyPriority(0);
    setIsCreateOpen(false);
  };

  const handleCreateRule = async () => {
    if (!selectedPolicy?.id || !ruleTarget.trim()) return;
    await createRule.mutateAsync({
      policy_id: selectedPolicy.id,
      rule_type: ruleType,
      action: ruleAction,
      target: ruleTarget,
      conditions: {},
      is_enabled: true,
    });
    setRuleTarget('');
    setIsRuleDialogOpen(false);
  };

  const handleAssignToGroup = async (groupId: string) => {
    if (!selectedPolicy?.id) return;
    const group = agentGroups.find(g => g.id === groupId);
    const memberCount = Number(group?.memberCount || 0);
    if (needsHighImpactConfirmation(memberCount)) {
      setPendingAssignGroupId(groupId);
      setIsAssignConfirmOpen(true);
      return;
    }
    await assignPolicy.mutateAsync({
      group_id: groupId,
      policy_id: selectedPolicy.id,
      tenant_id: selectedPolicy.tenant_id ?? '',
    });
    setIsAssignDialogOpen(false);
  };

  const policyGroupAssignments = groupPolicies.filter(
    (gp: { policy_id: string }) => gp.policy_id === selectedPolicy?.id
  );

  return {
    // Data
    tenant, policies, loading, selectedPolicy, rules, agentGroups,
    policyImpact, policyGroupAssignments, groupPolicies,
    // Form state
    policyName, setPolicyName, policyDescription, setPolicyDescription,
    policyPriority, setPolicyPriority,
    ruleType, setRuleType, ruleAction, setRuleAction,
    ruleTarget, setRuleTarget,
    // Dialog state
    isCreateOpen, setIsCreateOpen, isRuleDialogOpen, setIsRuleDialogOpen,
    isAssignDialogOpen, setIsAssignDialogOpen, isDeactivateConfirmOpen, setIsDeactivateConfirmOpen,
    pendingAssignGroupId, setPendingAssignGroupId, isAssignConfirmOpen, setIsAssignConfirmOpen,
    showTutorial, setShowTutorial,
    // Actions
    setSelectedPolicy, handleCreatePolicy, handleCreateRule, handleAssignToGroup,
    createPolicy, updatePolicy, deletePolicy, createRule, deleteRule,
    assignPolicy, unassignPolicy, logHighImpactAction,
  };
}
