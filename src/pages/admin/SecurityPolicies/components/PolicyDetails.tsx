import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Shield, Plus, Trash2, Play, Pause, Users, Link2,
  Usb, Package, Globe, ShieldCheck, XCircle, FileWarning, Database, Wifi 
} from 'lucide-react';
import { needsHighImpactConfirmation } from '@/components/ui/high-impact-confirm-dialog';
import { 
  RULE_TYPE_LABELS, ACTION_LABELS, ACTION_COLORS,
  type RuleType, type RuleAction, type SecurityPolicy 
} from '@/types/security-policies';
import type { AgentGroupWithCount, PolicyImpact } from '../types';

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

interface PolicyDetailsProps {
  selectedPolicy: SecurityPolicy;
  policyImpact: PolicyImpact;
  rules: any[];
  agentGroups: AgentGroupWithCount[];
  policyGroupAssignments: any[];
  // Rule form
  ruleType: RuleType;
  setRuleType: (v: RuleType) => void;
  ruleAction: RuleAction;
  setRuleAction: (v: RuleAction) => void;
  ruleTarget: string;
  setRuleTarget: (v: string) => void;
  isRuleDialogOpen: boolean;
  setIsRuleDialogOpen: (v: boolean) => void;
  isAssignDialogOpen: boolean;
  setIsAssignDialogOpen: (v: boolean) => void;
  // Actions
  onToggleActive: () => void;
  onDelete: () => void;
  onCreateRule: () => void;
  onDeleteRule: (id: string) => void;
  onAssignToGroup: (groupId: string) => void;
  onUnassignPolicy: (id: string) => void;
  createRuleIsPending: boolean;
}

export function PolicyDetails({
  selectedPolicy, policyImpact, rules, agentGroups, policyGroupAssignments,
  ruleType, setRuleType, ruleAction, setRuleAction, ruleTarget, setRuleTarget,
  isRuleDialogOpen, setIsRuleDialogOpen, isAssignDialogOpen, setIsAssignDialogOpen,
  onToggleActive, onDelete, onCreateRule, onDeleteRule, onAssignToGroup, onUnassignPolicy,
  createRuleIsPending,
}: PolicyDetailsProps) {
  return (
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
          <Button variant="outline" size="sm" onClick={onToggleActive}>
            {selectedPolicy.is_active ? (
              <><Pause className="h-4 w-4 mr-1" /> Desativar</>
            ) : (
              <><Play className="h-4 w-4 mr-1" /> Ativar</>
            )}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
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
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Adicionar Regra</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Regra</DialogTitle>
                    <DialogDescription>Configure uma nova regra de segurança</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Tipo de Regra</Label>
                      <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ACTION_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
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
                      <p className="text-xs text-muted-foreground">Use * para wildcards</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsRuleDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={onCreateRule} disabled={createRuleIsPending}>Adicionar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">Nenhuma regra configurada</div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">{RULE_TYPE_ICONS[rule.rule_type as RuleType]}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{RULE_TYPE_LABELS[rule.rule_type as RuleType]}</span>
                          <Badge className={ACTION_COLORS[rule.action as RuleAction]}>{ACTION_LABELS[rule.action as RuleAction]}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{rule.target}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteRule(rule.id)}>
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
                  <Button size="sm"><Link2 className="h-4 w-4 mr-1" />Atribuir a Grupo</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Atribuir Política</DialogTitle>
                    <DialogDescription>Selecione um grupo para aplicar esta política</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {agentGroups.length === 0 ? (
                      <p className="text-center text-muted-foreground">Nenhum grupo de agentes disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {agentGroups.map((group) => (
                          <div
                            key={group.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => onAssignToGroup(group.id)}
                          >
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span>{group.name}</span>
                            </div>
                            <Button size="sm" variant="ghost">Atribuir</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {policyGroupAssignments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">Política não atribuída a nenhum grupo</div>
            ) : (
              <div className="space-y-2">
                {policyGroupAssignments.map((assignment: any) => (
                  <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{assignment.agent_groups?.name || 'Grupo'}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onUnassignPolicy(assignment.id)}>
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
  );
}
