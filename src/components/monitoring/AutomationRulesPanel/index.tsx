import { formatBrazilDateTime } from '@/lib/date-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Zap, Plus, Trash2, Clock, Activity, Settings2, Play } from 'lucide-react';
import { useAutomationRules, METRIC_OPTIONS, OPERATOR_OPTIONS, ACTION_OPTIONS } from './useAutomationRules';

export function AutomationRulesPanel() {
  const {
    rules, executions, loading,
    showCreateDialog, setShowCreateDialog,
    newRule, setNewRule,
    createRule, toggleRule, deleteRule, runEvaluation,
    getMetricLabel, getActionLabel,
  } = useAutomationRules();

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando regras de automação...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Regras de Automação</CardTitle>
              <CardDescription>Respostas automáticas para eventos e métricas de segurança</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={runEvaluation}><Play className="h-4 w-4 mr-1" /> Avaliar Agora</Button>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Regra</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Regra de Automação</DialogTitle>
                    <DialogDescription>Defina condições e ações para respostas automáticas</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Nome da Regra</Label><Input value={newRule.name} onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Alerta CPU > 90%" /></div>
                    <div><Label>Descrição (opcional)</Label><Input value={newRule.description} onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))} placeholder="Descrição da regra" /></div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label>Métrica</Label><Select value={newRule.trigger_metric} onValueChange={(v) => setNewRule(prev => ({ ...prev, trigger_metric: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METRIC_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label>Operador</Label><Select value={newRule.trigger_operator} onValueChange={(v) => setNewRule(prev => ({ ...prev, trigger_operator: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OPERATOR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label>Valor (%)</Label><Input type="number" value={newRule.trigger_value} onChange={(e) => setNewRule(prev => ({ ...prev, trigger_value: Number(e.target.value) }))} min={0} max={100} /></div>
                    </div>
                    <div><Label>Ação</Label><Select value={newRule.action_type} onValueChange={(v) => setNewRule(prev => ({ ...prev, action_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTION_OPTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Cooldown (minutos)</Label><Input type="number" value={newRule.cooldown_minutes} onChange={(e) => setNewRule(prev => ({ ...prev, cooldown_minutes: Number(e.target.value) }))} min={1} /></div>
                      <div><Label>Prioridade (1-10)</Label><Input type="number" value={newRule.priority} onChange={(e) => setNewRule(prev => ({ ...prev, priority: Number(e.target.value) }))} min={1} max={10} /></div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
                    <Button onClick={createRule} disabled={!newRule.name.trim()}>Criar Regra</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Settings2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma regra de automação configurada</p>
              <p className="text-sm mt-1">Crie regras para automatizar respostas a eventos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => {
                const conditions = rule.trigger_conditions;
                const recentExecs = executions.filter(e => e.rule_id === rule.id).slice(0, 3);
                return (
                  <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <Switch checked={rule.is_active} onCheckedChange={(checked) => toggleRule(rule.id, checked)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{rule.name}</span>
                          <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-xs">{rule.is_active ? 'Ativa' : 'Inativa'}</Badge>
                          {rule.trigger_count > 0 && <Badge variant="outline" className="text-xs">{rule.trigger_count}x acionada</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>
                            {rule.trigger_type === 'metric_threshold' ? (
                              <>Se {getMetricLabel(conditions.metric || '')} {conditions.operator} {conditions.value}{conditions.metric?.includes('percent') ? '%' : ''}</>
                            ) : rule.trigger_type === 'anomaly_detection' ? (
                              <>Detecção: {(conditions as Record<string, unknown>).eventType === 'suspicious_process' ? 'Processo Suspeito' : (conditions as Record<string, unknown>).eventType || 'anomalia'} {(conditions as Record<string, unknown>).severity ? `(${(conditions as Record<string, unknown>).severity})` : ''}</>
                            ) : rule.trigger_type === 'agent_status' ? (
                              <>Evento: {(conditions as Record<string, unknown>).eventType === 'agent_offline' ? `Agente offline > ${(conditions as Record<string, unknown>).duration_minutes || 10}min` : (conditions as Record<string, unknown>).eventType || 'status'}</>
                            ) : (
                              <>Tipo: {rule.trigger_type}</>
                            )}
                          </span>
                          <span>→</span>
                          <span>{getActionLabel(rule.action_type)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {rule.cooldown_minutes}min</span>
                        </div>
                        {recentExecs.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {recentExecs.map(exec => (
                              <Badge key={exec.id} variant={exec.status === 'executed' ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
                                {exec.status === 'executed' ? '✓' : '✗'}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {executions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" />Execuções Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {executions.slice(0, 20).map(exec => {
                const rule = rules.find(r => r.id === exec.rule_id);
                return (
                  <div key={exec.id} className="flex items-center justify-between text-sm p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Badge variant={exec.status === 'executed' ? 'default' : 'destructive'} className="text-xs">{exec.status === 'executed' ? 'OK' : 'Falha'}</Badge>
                      <span className="truncate max-w-48">{rule?.name || 'Regra removida'}</span>
                    </div>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">{formatBrazilDateTime(exec.triggered_at, 'short')}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
