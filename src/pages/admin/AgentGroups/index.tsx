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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HighImpactConfirmDialog } from '@/components/ui/high-impact-confirm-dialog';
import {
  Users, Plus, Trash2, Edit2, Monitor,
  CheckCircle, XCircle, UserPlus, UserMinus,
  FolderOpen, Search, Shield,
} from 'lucide-react';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { useAgentGroupsPage } from './useAgentGroupsPage';

function getStatusBadge(status: string) {
  switch (status) {
    case 'online': return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">Online</Badge>;
    case 'offline': return <Badge variant="secondary">Offline</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AgentGroups() {
  const pg = useAgentGroupsPage();

  return (
    <AdminPageLayout title="Grupos de Computadores" description="Organize computadores em grupos para aplicar políticas de segurança">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Group List */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base">Grupos</CardTitle>
              <CardDescription>{pg.groups.length} grupos criados</CardDescription>
            </div>
            <Dialog open={pg.isCreateOpen} onOpenChange={(open) => {
              pg.setIsCreateOpen(open);
              if (!open) { pg.setGroupName(''); pg.setGroupDescription(''); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Criar Grupo</DialogTitle>
                  <DialogDescription>Crie um novo grupo e adicione computadores</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome do Grupo</Label>
                    <Input value={pg.groupName} onChange={(e) => pg.setGroupName(e.target.value)} placeholder="Ex: Financeiro, RH, TI..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Textarea value={pg.groupDescription} onChange={(e) => pg.setGroupDescription(e.target.value)} placeholder="Descreva o propósito deste grupo..." />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="flex items-center justify-between">
                      <span>Adicionar Computadores (opcional)</span>
                      {pg.createSelectedAgentIds.length > 0 && <Badge variant="secondary">{pg.createSelectedAgentIds.length} selecionados</Badge>}
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={pg.createSearchTerm} onChange={(e) => pg.setCreateSearchTerm(e.target.value)} placeholder="Buscar computador..." className="pl-9" />
                    </div>
                    <ScrollArea className="h-[200px] border rounded-lg">
                      {pg.allAgentsLoading ? (
                        <div className="p-4 text-center text-muted-foreground">Carregando...</div>
                      ) : pg.filteredAllAgents.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">{pg.createSearchTerm ? 'Nenhum computador encontrado' : 'Nenhum computador disponível'}</div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {pg.filteredAllAgents.map((agent) => (
                            <div key={agent.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${pg.createSelectedAgentIds.includes(agent.id) ? 'bg-primary/10 border border-primary' : 'hover:bg-muted/50'}`} onClick={() => pg.toggleCreateAgentSelection(agent.id)}>
                              <Checkbox checked={pg.createSelectedAgentIds.includes(agent.id)} onCheckedChange={() => pg.toggleCreateAgentSelection(agent.id)} />
                              <Monitor className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{agent.display_name || agent.agent_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{agent.hostname}</p>
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
                  <Button variant="outline" onClick={() => pg.setIsCreateOpen(false)}>Cancelar</Button>
                  <Button onClick={pg.handleCreateGroup} disabled={pg.createGroup.isPending || !pg.groupName.trim()}>
                    {pg.createSelectedAgentIds.length > 0 ? `Criar com ${pg.createSelectedAgentIds.length} PC${pg.createSelectedAgentIds.length > 1 ? 's' : ''}` : 'Criar Grupo'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {pg.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : pg.groups.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum grupo criado</p>
                  <p className="text-xs text-muted-foreground mt-1">Crie grupos para organizar seus computadores</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pg.groups.map((group) => (
                    <div key={group.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${pg.selectedGroupId === group.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`} onClick={() => pg.setSelectedGroupId(group.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><span className="font-medium text-sm">{group.name}</span></div>
                        <div className="flex items-center gap-1.5">
                          {pg.policyCountsByGroup[group.id]?.count > 0 && (
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary"><Shield className="h-3 w-3" />{pg.policyCountsByGroup[group.id].count}</Badge>
                            </TooltipTrigger><TooltipContent>
                              <p className="font-medium mb-1">Políticas atribuídas:</p>
                              <ul className="text-xs space-y-0.5">{pg.policyCountsByGroup[group.id].names.map((name, i) => <li key={i}>• {name}</li>)}</ul>
                            </TooltipContent></Tooltip></TooltipProvider>
                          )}
                          <Badge variant="secondary" className="text-xs">{pg.memberCounts[group.id] || 0} PCs</Badge>
                        </div>
                      </div>
                      {group.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Group Details */}
        <Card className="lg:col-span-2">
          {pg.selectedGroup ? (
            <>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{pg.selectedGroup.name}</CardTitle>
                    <Badge variant="outline">{pg.memberCounts[pg.selectedGroup.id] || 0} computadores</Badge>
                  </div>
                  <CardDescription className="mt-1">{pg.selectedGroup.description || 'Sem descrição'}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={pg.openEditDialog}><Edit2 className="h-4 w-4 mr-1" />Editar</Button>
                  <Button variant="destructive" size="sm" onClick={pg.handleDeleteGroup}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-medium">Computadores no Grupo</h4>
                  <Dialog open={pg.isAddAgentsOpen} onOpenChange={(open) => { pg.setIsAddAgentsOpen(open); if (!open) { pg.setSearchTerm(''); } }}>
                    <DialogTrigger asChild><Button size="sm"><UserPlus className="h-4 w-4 mr-1" />Adicionar Computadores</Button></DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Adicionar Computadores</DialogTitle>
                        <DialogDescription>Selecione os computadores para adicionar ao grupo "{pg.selectedGroup.name}"</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input value={pg.searchTerm} onChange={(e) => pg.setSearchTerm(e.target.value)} placeholder="Buscar computador..." className="pl-9" />
                        </div>
                        <ScrollArea className="h-[300px] border rounded-lg">
                          {pg.availableLoading ? (
                            <div className="p-4 text-center text-muted-foreground">Carregando...</div>
                          ) : pg.filteredAvailableAgents.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground">{pg.searchTerm ? 'Nenhum computador encontrado' : 'Todos os computadores já estão neste grupo'}</div>
                          ) : (
                            <div className="p-2 space-y-1">
                              {pg.filteredAvailableAgents.map((agent) => (
                                <div key={agent.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${pg.selectedAgentIds.includes(agent.id) ? 'bg-primary/10 border border-primary' : 'hover:bg-muted/50'}`} onClick={() => pg.toggleAgentSelection(agent.id)}>
                                  <Checkbox checked={pg.selectedAgentIds.includes(agent.id)} onCheckedChange={() => pg.toggleAgentSelection(agent.id)} />
                                  <Monitor className="h-4 w-4 text-muted-foreground" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{agent.display_name || agent.agent_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{agent.hostname}</p>
                                  </div>
                                  {getStatusBadge(agent.status)}
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                        {pg.selectedAgentIds.length > 0 && <p className="text-sm text-muted-foreground">{pg.selectedAgentIds.length} computador(es) selecionado(s)</p>}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => pg.setIsAddAgentsOpen(false)}>Cancelar</Button>
                        <Button onClick={pg.handleAddAgents} disabled={pg.addAgents.isPending || pg.selectedAgentIds.length === 0}>Adicionar ({pg.selectedAgentIds.length})</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <Separator className="mb-4" />
                <ScrollArea className="h-[350px]">
                  {pg.membersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                  ) : pg.members.length === 0 ? (
                    <div className="text-center py-8">
                      <Monitor className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">Nenhum computador neste grupo</p>
                      <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar Computadores" para começar</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pg.members.map((member: any) => {
                        const agent = member.agents;
                        if (!agent) return null;
                        return (
                          <div key={member.agent_id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3">
                              <Monitor className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">{agent.display_name || agent.agent_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {agent.hostname}
                                  {agent.last_heartbeat && <span className="ml-2">• Visto {formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true, locale: ptBR })}</span>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(agent.status)}
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => pg.removeAgent.mutate(member.agent_id)}>
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
      <Dialog open={pg.isEditOpen} onOpenChange={pg.setIsEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Grupo</DialogTitle><DialogDescription>Altere as informações do grupo</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Nome do Grupo</Label><Input value={pg.groupName} onChange={(e) => pg.setGroupName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={pg.groupDescription} onChange={(e) => pg.setGroupDescription(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => pg.setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={pg.handleUpdateGroup} disabled={pg.updateGroup.isPending || !pg.groupName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HighImpactConfirmDialog
        open={pg.isDeleteConfirmOpen} onOpenChange={pg.setIsDeleteConfirmOpen}
        impactCount={pg.selectedGroupId ? (pg.memberCounts[pg.selectedGroupId] || 0) : 0}
        impactType="computers" actionLabel="Excluir Grupo"
        actionDescription={`O grupo "${pg.selectedGroup?.name}" será excluído permanentemente. Os computadores não serão removidos do sistema, apenas desvinculados do grupo.`}
        onConfirm={pg.executeDeleteGroup} destructive
      />
    </AdminPageLayout>
  );
}
