import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shield } from 'lucide-react';
import { HighImpactConfirmDialog, needsHighImpactConfirmation } from '@/components/ui/high-impact-confirm-dialog';
import { useSecurityPoliciesPage } from './hooks/useSecurityPoliciesPage';
import { PolicyTutorial } from './components/PolicyTutorial';
import { PolicyList } from './components/PolicyList';
import { PolicyDetails } from './components/PolicyDetails';

export default function SecurityPolicies() {
  const state = useSecurityPoliciesPage();

  return (
    <AdminPageLayout
      title="Políticas de Segurança"
      description="Configure políticas de segurança personalizadas por grupo de computadores"
    >
      <PolicyTutorial showTutorial={state.showTutorial} onToggle={() => state.setShowTutorial(!state.showTutorial)} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PolicyList
          policies={state.policies}
          loading={state.loading}
          selectedPolicy={state.selectedPolicy}
          onSelect={state.setSelectedPolicy}
          onCreateClick={() => state.setIsCreateOpen(true)}
        />

        <Card className="lg:col-span-2">
          {state.selectedPolicy ? (
            <PolicyDetails
              selectedPolicy={state.selectedPolicy}
              policyImpact={state.policyImpact}
              rules={state.rules}
              agentGroups={state.agentGroups}
              policyGroupAssignments={state.policyGroupAssignments}
              ruleType={state.ruleType}
              setRuleType={state.setRuleType}
              ruleAction={state.ruleAction}
              setRuleAction={state.setRuleAction}
              ruleTarget={state.ruleTarget}
              setRuleTarget={state.setRuleTarget}
              isRuleDialogOpen={state.isRuleDialogOpen}
              setIsRuleDialogOpen={state.setIsRuleDialogOpen}
              isAssignDialogOpen={state.isAssignDialogOpen}
              setIsAssignDialogOpen={state.setIsAssignDialogOpen}
              onToggleActive={() => {
                if (state.selectedPolicy!.is_active && needsHighImpactConfirmation(state.policyImpact.agents)) {
                  state.setIsDeactivateConfirmOpen(true);
                } else {
                  state.updatePolicy.mutate({ id: state.selectedPolicy!.id, is_active: !state.selectedPolicy!.is_active });
                }
              }}
              onDelete={() => {
                state.deletePolicy.mutate(state.selectedPolicy!.id);
                state.setSelectedPolicy(null);
              }}
              onCreateRule={state.handleCreateRule}
              onDeleteRule={(id) => state.deleteRule.mutate(id)}
              onAssignToGroup={state.handleAssignToGroup}
              onUnassignPolicy={(id) => state.unassignPolicy.mutate(id)}
              createRuleIsPending={state.createRule.isPending}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              <Shield className="h-12 w-12 mb-4 opacity-50" />
              <p>Selecione uma política para ver os detalhes</p>
            </div>
          )}
        </Card>
      </div>

      {/* Create Policy Dialog */}
      <Dialog open={state.isCreateOpen} onOpenChange={state.setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Política</DialogTitle>
            <DialogDescription>Defina uma nova política de segurança</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={state.policyName} onChange={(e) => state.setPolicyName(e.target.value)} placeholder="Ex: Política de Firewall" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={state.policyDescription} onChange={(e) => state.setPolicyDescription(e.target.value)} placeholder="Descreva o objetivo desta política..." />
            </div>
            <div className="space-y-2">
              <Label>Prioridade (maior = mais importante)</Label>
              <Input type="number" value={state.policyPriority} onChange={(e) => state.setPolicyPriority(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => state.setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={state.handleCreatePolicy} disabled={state.createPolicy.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* High Impact Confirmations */}
      <HighImpactConfirmDialog
        open={state.isDeactivateConfirmOpen}
        onOpenChange={state.setIsDeactivateConfirmOpen}
        impactCount={state.policyImpact.agents}
        impactType="computers"
        actionLabel="Desativar Política"
        actionDescription={`A política "${state.selectedPolicy?.name}" será desativada. As regras deixarão de ser aplicadas imediatamente.`}
        onConfirm={async () => {
          if (state.selectedPolicy) {
            await state.logHighImpactAction('security_policy', state.selectedPolicy.id, 'deactivate', {
              impactCount: state.policyImpact.agents, impactType: 'agents',
              thresholdExceeded: true, targetResourceName: state.selectedPolicy.name,
            });
            state.updatePolicy.mutate({ id: state.selectedPolicy.id, is_active: false });
          }
          state.setIsDeactivateConfirmOpen(false);
        }}
        destructive
      />

      <HighImpactConfirmDialog
        open={state.isAssignConfirmOpen}
        onOpenChange={state.setIsAssignConfirmOpen}
        impactCount={state.agentGroups.find(g => g.id === state.pendingAssignGroupId)?.memberCount || 0}
        impactType="computers"
        actionLabel="Atribuir Política"
        actionDescription={`A política "${state.selectedPolicy?.name}" será aplicada a todos os computadores do grupo selecionado.`}
        onConfirm={async () => {
          if (state.pendingAssignGroupId && state.selectedPolicy?.id) {
            const group = state.agentGroups.find(g => g.id === state.pendingAssignGroupId);
            await state.logHighImpactAction('security_policy', state.selectedPolicy.id, 'assign', {
              impactCount: group?.memberCount || 0, impactType: 'computers',
              thresholdExceeded: true, targetResourceId: state.pendingAssignGroupId,
              targetResourceName: group?.name,
            });
            await state.assignPolicy.mutateAsync({
              group_id: state.pendingAssignGroupId,
              policy_id: state.selectedPolicy.id,
              tenant_id: state.selectedPolicy.tenant_id ?? '',
            });
          }
          state.setPendingAssignGroupId(null);
          state.setIsAssignConfirmOpen(false);
          state.setIsAssignDialogOpen(false);
        }}
      />
    </AdminPageLayout>
  );
}
