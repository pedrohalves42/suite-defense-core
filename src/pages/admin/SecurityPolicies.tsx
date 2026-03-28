import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, Plus, Settings, Trash2, Edit, 
  Usb, Package, Globe, ShieldCheck, XCircle, 
  FileWarning, Database, Wifi, Play, Pause,
  Users, Link2
} from 'lucide-react';
import { useSecurityPolicies, usePolicyRules, useAgentGroupPolicies } from '@/hooks/useSecurityPolicies';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useQuery } from '@tanstack/react-query';
import { 
  RULE_TYPE_LABELS, 
  ACTION_LABELS, 
  ACTION_COLORS,
  type RuleType,
  type RuleAction,
  type SecurityPolicy
} from '@/types/security-policies';
import { HighImpactConfirmDialog, needsHighImpactConfirmation } from '@/components/ui/high-impact-confirm-dialog';

const RULE_TYPE_ICONS: Record<RuleType, React.ReactNode> = {
  usb_control: <Usb className="h-4 w-4" />,
  software_restriction: <Package className="h-4 w-4" />,
  website_block: <Globe className="h-4 w-4" />,
  firewall_rule: <ShieldCheck className="h-4 w-4" />,
  process_block: <XCircle className="h-4 w-4" />,
  file_access: <FileWarning className="h-4 w-4" />,
  registry_protection: <Database className="h-4 w-4" />,
  network_restriction: <Wifi className="h-4 w-4" />,
};

export default function SecurityPolicies() {
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
  
  // Form state
  const [policyName, setPolicyName] = useState('');
  const [policyDescription, setPolicyDescription] = useState('');
  const [policyPriority, setPolicyPriority] = useState(0);
  
  // Rule form state
  const [ruleType, setRuleType] = useState<RuleType>('website_block');
  const [ruleAction, setRuleAction] = useState<RuleAction>('block');
  const [ruleTarget, setRuleTarget] = useState('');
  
  const { rules, createRule, deleteRule } = usePolicyRules(selectedPolicy?.id || null);

  // Fetch agent groups with member counts
  const { data: agentGroups = [] } = useQuery({
    queryKey: ['agent-groups-with-counts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data: groups, error } = await supabase
        .from('agent_groups')
        .select('id, name, description, tenant_id, created_at, updated_at')
        .eq('tenant_id', tenant.id);
      if (error) throw error;
      
      // Fetch member counts for each group
      const groupsWithCounts = await Promise.all((groups || []).map(async (group) => {
        const { count } = await supabase
          .from('agents_groups')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);
        return { ...group, memberCount: count || 0 };
      }));
      
      return groupsWithCounts;
    },
    enabled: !!tenant?.id,
  });
  
  // Calculate total impact for selected policy
  const getPolicyImpact = () => {
    if (!selectedPolicy) return { groups: 0, agents: 0 };
    const assignedGroups = groupPolicies.filter((gp: Record<string, unknown>) => gp.policy_id === selectedPolicy.id);
    let totalAgents = 0;
    assignedGroups.forEach((gp: Record<string, unknown>) => {
      const group = agentGroups.find(g => g.id === gp.group_id);
      if (group) totalAgents += (group as Record<string, unknown>).memberCount || 0;
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
    const memberCount = (group as never)?.memberCount || 0;
    
    // Check if high impact confirmation is needed
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

  const [showTutorial, setShowTutorial] = useState(false);

  return (
    <AdminPageLayout
      title="Políticas de Segurança"
      description="Configure políticas de segurança personalizadas por grupo de computadores"
    >
      {/* Tutorial Card */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Como usar Políticas de Segurança
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowTutorial(!showTutorial)}>
              {showTutorial ? 'Ocultar' : 'Ver Tutorial'}
            </Button>
          </div>
        </CardHeader>
        {showTutorial && (
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 p-3 bg-background rounded-lg border">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  Criar Política
                </div>
                <p className="text-muted-foreground">
                  Clique em "Nova" para criar uma política. Dê um nome descritivo e defina a prioridade (políticas com maior prioridade têm precedência).
                </p>
              </div>
              <div className="space-y-2 p-3 bg-background rounded-lg border">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                  Adicionar Regras
                </div>
                <p className="text-muted-foreground">
                  Selecione a política e clique em "Adicionar Regra". Escolha o tipo de regra (USB, software, website, etc.), a ação (bloquear, permitir, monitorar) e o alvo.
                </p>
              </div>
              <div className="space-y-2 p-3 bg-background rounded-lg border">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                  Atribuir a Grupos
                </div>
                <p className="text-muted-foreground">
                  Na aba "Grupos Atribuídos", vincule a política aos grupos de computadores desejados. As regras serão aplicadas automaticamente.
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <h4 className="font-semibold">Tipos de Regras Disponíveis:</h4>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Usb className="h-4 w-4" /> <span>Controle USB</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" /> <span>Restrição de Software</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" /> <span>Bloqueio de Sites</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" /> <span>Regras de Firewall</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-4 w-4" /> <span>Bloqueio de Processos</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileWarning className="h-4 w-4" /> <span>Acesso a Arquivos</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-4 w-4" /> <span>Proteção de Registro</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wifi className="h-4 w-4" /> <span>Restrição de Rede</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Dicas:</h4>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Use <code className="bg-muted px-1 rounded">*</code> como wildcard. Ex: <code className="bg-muted px-1 rounded">*.facebook.com</code> bloqueia todos os subdomínios.</li>
                <li>Políticas podem ser ativadas/desativadas sem excluí-las.</li>
                <li>Um grupo pode ter múltiplas políticas. A de maior prioridade prevalece em conflitos.</li>
              </ul>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Políticas */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base">Políticas</CardTitle>
              <CardDescription>{policies.length} políticas configuradas</CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Nova
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Política</DialogTitle>
                  <DialogDescription>
                    Defina uma nova política de segurança
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input 
                      value={policyName} 
                      onChange={(e) => setPolicyName(e.target.value)}
                      placeholder="Ex: Política de Firewall"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea 
                      value={policyDescription} 
                      onChange={(e) => setPolicyDescription(e.target.value)}
                      placeholder="Descreva o objetivo desta política..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prioridade (maior = mais importante)</Label>
                    <Input 
                      type="number"
                      value={policyPriority} 
                      onChange={(e) => setPolicyPriority(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreatePolicy} disabled={createPolicy.isPending}>
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : policies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma política criada
                </div>
              ) : (
                <div className="space-y-2">
                  {policies.map((policy) => (
                    <div
                      key={policy.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPolicy?.id === policy.id 
                          ? 'bg-primary/10 border-primary' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedPolicy(policy)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{policy.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={policy.is_active ? 'default' : 'secondary'} className="text-xs">
                            {policy.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </div>
                      </div>
                      {policy.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {policy.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detalhes da Política */}
        <Card className="lg:col-span-2">
          {selectedPolicy ? (
            <>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{selectedPolicy.name}</CardTitle>
                    <Badge variant={selectedPolicy.is_active ? 'default' : 'secondary'}>
                      {selectedPolicy.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                    {policyImpact.agents > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Users className="h-3 w-3" />
                        Afeta {policyImpact.groups} grupo{policyImpact.groups !== 1 ? 's' : ''} ({policyImpact.agents} PC{policyImpact.agents !== 1 ? 's' : ''})
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {selectedPolicy.description || 'Sem descrição'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // If deactivating and high impact, show confirmation
                      if (selectedPolicy.is_active && needsHighImpactConfirmation(policyImpact.agents)) {
                        setIsDeactivateConfirmOpen(true);
                      } else {
                        updatePolicy.mutate({ 
                          id: selectedPolicy.id, 
                          is_active: !selectedPolicy.is_active 
                        });
                      }
                    }}
                  >
                    {selectedPolicy.is_active ? (
                      <><Pause className="h-4 w-4 mr-1" /> Desativar</>
                    ) : (
                      <><Play className="h-4 w-4 mr-1" /> Ativar</>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      deletePolicy.mutate(selectedPolicy.id);
                      setSelectedPolicy(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="rules">
                  <TabsList>
                    <TabsTrigger value="rules">Regras</TabsTrigger>
                    <TabsTrigger value="groups">Grupos Atribuídos</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="rules" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-medium">Regras da Política</h4>
                      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar Regra
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Adicionar Regra</DialogTitle>
                            <DialogDescription>
                              Configure uma nova regra de segurança
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Tipo de Regra</Label>
                              <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                      <div className="flex items-center gap-2">
                                        {RULE_TYPE_ICONS[key as RuleType]}
                                        {label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Ação</Label>
                              <Select value={ruleAction} onValueChange={(v) => setRuleAction(v as RuleAction)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Alvo</Label>
                              <Input 
                                value={ruleTarget} 
                                onChange={(e) => setRuleTarget(e.target.value)}
                                placeholder={
                                  ruleType === 'website_block' ? 'Ex: facebook.com, *.twitter.com' :
                                  ruleType === 'software_restriction' ? 'Ex: torrent*, *.exe' :
                                  ruleType === 'process_block' ? 'Ex: chrome.exe, notepad.exe' :
                                  'Especifique o alvo'
                                }
                              />
                              <p className="text-xs text-muted-foreground">
                                Use * para wildcards
                              </p>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsRuleDialogOpen(false)}>
                              Cancelar
                            </Button>
                            <Button onClick={handleCreateRule} disabled={createRule.isPending}>
                              Adicionar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    {rules.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        Nenhuma regra configurada
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {rules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-md bg-muted">
                                {RULE_TYPE_ICONS[rule.rule_type as RuleType]}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {RULE_TYPE_LABELS[rule.rule_type as RuleType]}
                                  </span>
                                  <Badge className={ACTION_COLORS[rule.action as RuleAction]}>
                                    {ACTION_LABELS[rule.action as RuleAction]}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {rule.target}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteRule.mutate(rule.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="groups" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-medium">Grupos com esta Política</h4>
                      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <Link2 className="h-4 w-4 mr-1" />
                            Atribuir a Grupo
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Atribuir Política</DialogTitle>
                            <DialogDescription>
                              Selecione um grupo para aplicar esta política
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            {agentGroups.length === 0 ? (
                              <p className="text-center text-muted-foreground">
                                Nenhum grupo de agentes disponível
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {agentGroups.map((group) => (
                                  <div
                                    key={group.id}
                                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                                    onClick={() => handleAssignToGroup(group.id)}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Users className="h-4 w-4" />
                                      <span>{group.name}</span>
                                    </div>
                                    <Button size="sm" variant="ghost">
                                      Atribuir
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    {policyGroupAssignments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        Política não atribuída a nenhum grupo
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {policyGroupAssignments.map((assignment: { id: string; agent_groups: { name: string }; assigned_at: string }) => (
                          <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span>{assignment.agent_groups?.name || 'Grupo'}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => unassignPolicy.mutate(assignment.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              <Shield className="h-12 w-12 mb-4 opacity-50" />
              <p>Selecione uma política para ver os detalhes</p>
            </div>
          )}
        </Card>
      </div>
      
      {/* High Impact Deactivate Confirmation */}
      <HighImpactConfirmDialog
        open={isDeactivateConfirmOpen}
        onOpenChange={setIsDeactivateConfirmOpen}
        impactCount={policyImpact.agents}
        impactType="computers"
        actionLabel="Desativar Política"
        actionDescription={`A política "${selectedPolicy?.name}" será desativada. As regras deixarão de ser aplicadas imediatamente.`}
        onConfirm={async () => {
          if (selectedPolicy) {
            await logHighImpactAction('security_policy', selectedPolicy.id, 'deactivate', {
              impactCount: policyImpact.agents,
              impactType: 'agents',
              thresholdExceeded: true,
              targetResourceName: selectedPolicy.name,
            });
            updatePolicy.mutate({ id: selectedPolicy.id, is_active: false });
          }
          setIsDeactivateConfirmOpen(false);
        }}
        destructive
      />
      
      {/* High Impact Assign Confirmation */}
      <HighImpactConfirmDialog
        open={isAssignConfirmOpen}
        onOpenChange={setIsAssignConfirmOpen}
        impactCount={agentGroups.find(g => g.id === pendingAssignGroupId)?.memberCount || 0}
        impactType="computers"
        actionLabel="Atribuir Política"
        actionDescription={`A política "${selectedPolicy?.name}" será aplicada a todos os computadores do grupo selecionado.`}
        onConfirm={async () => {
          if (pendingAssignGroupId && selectedPolicy?.id) {
            const group = agentGroups.find(g => g.id === pendingAssignGroupId);
            const memberCount = group?.memberCount || 0;
            
            await logHighImpactAction('security_policy', selectedPolicy.id, 'assign', {
              impactCount: memberCount,
              impactType: 'computers',
              thresholdExceeded: true,
              targetResourceId: pendingAssignGroupId,
              targetResourceName: group?.name,
            });
            
            await assignPolicy.mutateAsync({
              group_id: pendingAssignGroupId,
              policy_id: selectedPolicy.id,
              tenant_id: selectedPolicy.tenant_id ?? '',
            });
          }
          setPendingAssignGroupId(null);
          setIsAssignConfirmOpen(false);
          setIsAssignDialogOpen(false);
        }}
      />
    </AdminPageLayout>
  );
}
