import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Users, Plus, Trash2, Edit2, Monitor, 
  CheckCircle, XCircle, UserPlus, UserMinus,
  FolderOpen, Search
} from 'lucide-react';
import { useAgentGroups, useAgentGroupMembers, useAvailableAgents } from '@/hooks/useAgentGroups';
import { useAgentGroupPolicies } from '@/hooks/useSecurityPolicies';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield } from 'lucide-react';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { HighImpactConfirmDialog, needsHighImpactConfirmation } from '@/components/ui/high-impact-confirm-dialog';
import { useAuditLog } from '@/hooks/useAuditLog';

export default function AgentGroups() {
  const { groups, memberCounts, isLoading, createGroup, updateGroup, deleteGroup } = useAgentGroups();
  const { groupPolicies } = useAgentGroupPolicies();
  const { logHighImpactAction } = useAuditLog();
  
  // Build policy counts per group
  const policyCountsByGroup = groupPolicies.reduce((acc, gp) => {
    const groupId = (gp as Record<string, unknown>).agent_groups?.id || gp.group_id;
    acc[groupId] = acc[groupId] || { count: 0, names: [] };
    acc[groupId].count++;
    const policyName = (gp as Record<string, unknown>).security_policies?.name;
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
  
  // Form state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  
  // Selected agents for batch add
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  // Selected agents for creation
  const [createSelectedAgentIds, setCreateSelectedAgentIds] = useState<string[]>([]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const { members, isLoading: membersLoading, addAgents, removeAgent } = useAgentGroupMembers(selectedGroupId);
  const { agents: availableAgents, isLoading: availableLoading } = useAvailableAgents(selectedGroupId);
  // All agents for creation dialog
  const { agents: allAgents, isLoading: allAgentsLoading } = useAvailableAgents(null);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    const newGroup = await createGroup.mutateAsync({ name: groupName, description: groupDescription || undefined });
    // If agents were selected, add them to the new group
    if (createSelectedAgentIds.length > 0 && newGroup?.id) {
      const tenantId = (newGroup as Record<string, unknown>).tenant_id;
      const inserts = createSelectedAgentIds.map(agent_id => ({ agent_id, group_id: newGroup.id, tenant_id: tenantId }));
      await supabase.from('agents_groups').insert(inserts);
    }
    setGroupName('');
    setGroupDescription('');
    setCreateSelectedAgentIds([]);
    setCreateSearchTerm('');
    setIsCreateOpen(false);
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroupId || !groupName.trim()) return;
    await updateGroup.mutateAsync({ id: selectedGroupId, name: groupName, description: groupDescription });
    setIsEditOpen(false);
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroupId) return;
    const memberCount = memberCounts[selectedGroupId] || 0;
    
    // Check if high impact confirmation is needed
    if (needsHighImpactConfirmation(memberCount)) {
      setIsDeleteConfirmOpen(true);
      return;
    }
    
    await executeDeleteGroup();
  };

  const executeDeleteGroup = async () => {
    if (!selectedGroupId) return;
    
    const memberCount = memberCounts[selectedGroupId] || 0;
    const group = groups.find(g => g.id === selectedGroupId);
    
    // Log high impact action before deletion
    await logHighImpactAction('agent_group', selectedGroupId, 'delete', {
      impactCount: memberCount,
      impactType: 'computers',
      thresholdExceeded: needsHighImpactConfirmation(memberCount),
      targetResourceName: group?.name,
    });
    
    await deleteGroup.mutateAsync(selectedGroupId);
    setSelectedGroupId(null);
    setIsDeleteConfirmOpen(false);
  };

  const handleAddAgents = async () => {
    if (selectedAgentIds.length === 0) return;
    await addAgents.mutateAsync(selectedAgentIds);
    setSelectedAgentIds([]);
    setIsAddAgentsOpen(false);
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
    return (
      agent.agent_name?.toLowerCase().includes(search) ||
      agent.display_name?.toLowerCase().includes(search) ||
      agent.hostname?.toLowerCase().includes(search)
    );
  });

  const filteredAllAgents = allAgents.filter(agent => {
    const search = createSearchTerm.toLowerCase();
    return (
      agent.agent_name?.toLowerCase().includes(search) ||
      agent.display_name?.toLowerCase().includes(search) ||
      agent.hostname?.toLowerCase().includes(search)
    );
  });

  const toggleCreateAgentSelection = (agentId: string) => {
    setCreateSelectedAgentIds(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">Online</Badge>;
      case 'offline':
        return <Badge variant="secondary">Offline</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AdminPageLayout
      title="Grupos de Computadores"
      description="Organize computadores em grupos para aplicar políticas de segurança"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Grupos */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base">Grupos</CardTitle>
              <CardDescription>{groups.length} grupos criados</CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (!open) {
                setCreateSelectedAgentIds([]);
                setCreateSearchTerm('');
                setGroupName('');
                setGroupDescription('');
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Criar Grupo</DialogTitle>
                  <DialogDescription>
                    Crie um novo grupo e adicione computadores
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome do Grupo</Label>
                    <Input 
                      value={groupName} 
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Ex: Financeiro, RH, TI..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Textarea 
                      value={groupDescription} 
                      onChange={(e) => setGroupDescription(e.target.value)}
                      placeholder="Descreva o propósito deste grupo..."
                    />
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label className="flex items-center justify-between">
                      <span>Adicionar Computadores (opcional)</span>
                      {createSelectedAgentIds.length > 0 && (
                        <Badge variant="secondary">{createSelectedAgentIds.length} selecionados</Badge>
                      )}
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        value={createSearchTerm}
                        onChange={(e) => setCreateSearchTerm(e.target.value)}
                        placeholder="Buscar computador..."
                        className="pl-9"
                      />
                    </div>
                    <ScrollArea className="h-[200px] border rounded-lg">
                      {allAgentsLoading ? (
                        <div className="p-4 text-center text-muted-foreground">Carregando...</div>
                      ) : filteredAllAgents.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          {createSearchTerm ? 'Nenhum computador encontrado' : 'Nenhum computador disponível'}
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {filteredAllAgents.map((agent) => (
                            <div
                              key={agent.id}
                              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                createSelectedAgentIds.includes(agent.id)
                                  ? 'bg-primary/10 border border-primary'
                                  : 'hover:bg-muted/50'
                              }`}
                              onClick={() => toggleCreateAgentSelection(agent.id)}
                            >
                              <Checkbox 
                                checked={createSelectedAgentIds.includes(agent.id)}
                                onCheckedChange={() => toggleCreateAgentSelection(agent.id)}
                              />
                              <Monitor className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {agent.display_name || agent.agent_name}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {agent.hostname}
                                </p>
                              </div>
                              {getStatusBadge(agent.status)}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateGroup} disabled={createGroup.isPending || !groupName.trim()}>
                    {createSelectedAgentIds.length > 0 
                      ? `Criar com ${createSelectedAgentIds.length} PC${createSelectedAgentIds.length > 1 ? 's' : ''}` 
                      : 'Criar Grupo'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : groups.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum grupo criado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Crie grupos para organizar seus computadores
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedGroupId === group.id 
                          ? 'bg-primary/10 border-primary' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{group.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {policyCountsByGroup[group.id]?.count > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                                    <Shield className="h-3 w-3" />
                                    {policyCountsByGroup[group.id].count}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium mb-1">Políticas atribuídas:</p>
                                  <ul className="text-xs space-y-0.5">
                                    {policyCountsByGroup[group.id].names.map((name, i) => (
                                      <li key={i}>• {name}</li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {memberCounts[group.id] || 0} PCs
                          </Badge>
                        </div>
                      </div>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {group.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detalhes do Grupo */}
        <Card className="lg:col-span-2">
          {selectedGroup ? (
            <>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{selectedGroup.name}</CardTitle>
                    <Badge variant="outline">
                      {memberCounts[selectedGroup.id] || 0} computadores
                    </Badge>
                  </div>
                  <CardDescription className="mt-1">
                    {selectedGroup.description || 'Sem descrição'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={openEditDialog}>
                    <Edit2 className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDeleteGroup}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-medium">Computadores no Grupo</h4>
                  <Dialog open={isAddAgentsOpen} onOpenChange={(open) => {
                    setIsAddAgentsOpen(open);
                    if (!open) {
                      setSelectedAgentIds([]);
                      setSearchTerm('');
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <UserPlus className="h-4 w-4 mr-1" />
                        Adicionar Computadores
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Adicionar Computadores</DialogTitle>
                        <DialogDescription>
                          Selecione os computadores para adicionar ao grupo "{selectedGroup.name}"
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar computador..."
                            className="pl-9"
                          />
                        </div>
                        <ScrollArea className="h-[300px] border rounded-lg">
                          {availableLoading ? (
                            <div className="p-4 text-center text-muted-foreground">Carregando...</div>
                          ) : filteredAvailableAgents.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground">
                              {searchTerm ? 'Nenhum computador encontrado' : 'Todos os computadores já estão neste grupo'}
                            </div>
                          ) : (
                            <div className="p-2 space-y-1">
                              {filteredAvailableAgents.map((agent) => (
                                <div
                                  key={agent.id}
                                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                    selectedAgentIds.includes(agent.id)
                                      ? 'bg-primary/10 border border-primary'
                                      : 'hover:bg-muted/50'
                                  }`}
                                  onClick={() => toggleAgentSelection(agent.id)}
                                >
                                  <Checkbox 
                                    checked={selectedAgentIds.includes(agent.id)}
                                    onCheckedChange={() => toggleAgentSelection(agent.id)}
                                  />
                                  <Monitor className="h-4 w-4 text-muted-foreground" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {agent.display_name || agent.agent_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {agent.hostname}
                                    </p>
                                  </div>
                                  {getStatusBadge(agent.status)}
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                        {selectedAgentIds.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {selectedAgentIds.length} computador(es) selecionado(s)
                          </p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddAgentsOpen(false)}>
                          Cancelar
                        </Button>
                        <Button 
                          onClick={handleAddAgents} 
                          disabled={addAgents.isPending || selectedAgentIds.length === 0}
                        >
                          Adicionar ({selectedAgentIds.length})
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <Separator className="mb-4" />

                <ScrollArea className="h-[350px]">
                  {membersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                  ) : members.length === 0 ? (
                    <div className="text-center py-8">
                      <Monitor className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">Nenhum computador neste grupo</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Clique em "Adicionar Computadores" para começar
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member: Record<string, unknown>) => {
                        const agent = member.agents;
                        if (!agent) return null;
                        return (
                          <div
                            key={member.agent_id}
                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Monitor className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">
                                  {agent.display_name || agent.agent_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {agent.hostname}
                                  {agent.last_heartbeat && (
                                    <span className="ml-2">
                                      • Visto {formatDistanceToNow(new Date(agent.last_heartbeat), { 
                                        addSuffix: true, 
                                        locale: ptBR 
                                      })}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(agent.status)}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeAgent.mutate(member.agent_id)}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              <Users className="h-16 w-16 mb-4 opacity-30" />
              <p>Selecione um grupo para ver os detalhes</p>
            </div>
          )}
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Grupo</DialogTitle>
            <DialogDescription>
              Altere as informações do grupo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Grupo</Label>
              <Input 
                value={groupName} 
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={groupDescription} 
                onChange={(e) => setGroupDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateGroup} disabled={updateGroup.isPending || !groupName.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* High Impact Delete Confirmation */}
      <HighImpactConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        impactCount={selectedGroupId ? (memberCounts[selectedGroupId] || 0) : 0}
        impactType="computers"
        actionLabel="Excluir Grupo"
        actionDescription={`O grupo "${selectedGroup?.name}" será excluído permanentemente. Os computadores não serão removidos do sistema, apenas desvinculados do grupo.`}
        onConfirm={executeDeleteGroup}
        destructive
      />
    </AdminPageLayout>
  );
}
