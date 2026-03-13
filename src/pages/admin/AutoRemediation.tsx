import { useState } from 'react';
import { useAutoRemediation, type RemediationActionType, ROLLBACK_SUPPORTED } from '@/hooks/useAutoRemediation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, Zap, CheckCircle2, Loader2, Search, TrendingUp, AlertTriangle, Undo2, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import TriggerRemediationDialog from '@/components/admin/TriggerRemediationDialog';

const ACTION_LABELS: Record<RemediationActionType, { label: string; icon: string }> = {
  kill_process: { label: 'Encerrar Processo', icon: '🔪' },
  firewall_block: { label: 'Bloquear IP', icon: '🧱' },
  patch_apply: { label: 'Aplicar Patch', icon: '🩹' },
  quarantine_file: { label: 'Quarentena', icon: '🔒' },
  restart_service: { label: 'Reiniciar Serviço', icon: '🔄' },
  enable_antivirus: { label: 'Ativar Antivírus', icon: '🛡️' },
  enable_firewall: { label: 'Ativar Firewall', icon: '🔥' },
  block_usb_device: { label: 'Bloquear USB', icon: '🔌' },
  suggest_patch: { label: 'Sugerir Patch', icon: '💡' },
  force_windows_update: { label: 'Windows Update', icon: '⬆️' },
};

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'outline' },
  executing: { label: 'Executando', variant: 'secondary' },
  success: { label: 'Sucesso', variant: 'default' },
  failed: { label: 'Falha', variant: 'destructive' },
  rolled_back: { label: 'Revertido', variant: 'destructive' },
};

export default function AutoRemediationPage() {
  const { actions, isLoading, approveAction, rollbackAction } = useAutoRemediation();
  const [search, setSearch] = useState('');

  const filteredActions = actions.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.agent_name?.toLowerCase().includes(q) ||
      a.action_type.toLowerCase().includes(q) ||
      a.trigger_source.toLowerCase().includes(q)
    );
  });

  const terminalActions = actions.filter(a => ['success', 'failed'].includes(a.status));
  const stats = {
    total: actions.length,
    success: actions.filter(a => a.status === 'success').length,
    pending: actions.filter(a => a.status === 'pending').length,
    failed: actions.filter(a => a.status === 'failed').length,
    rolledBack: actions.filter(a => a.status === 'rolled_back').length,
    successRate: terminalActions.length > 0
      ? Math.round((actions.filter(a => a.status === 'success').length / terminalActions.length) * 100)
      : 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Auto-Remediação
          </h1>
          <p className="text-muted-foreground mt-1">
            Motor closed-loop com blast radius, circuit breaker e rollback automático
          </p>
        </div>
        <TriggerRemediationDialog />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-green-500">{stats.success}</div>
            <p className="text-xs text-muted-foreground">Sucesso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-amber-500">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">Falhas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.rolledBack}</div>
            <p className="text-xs text-muted-foreground">Revertidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
              <TrendingUp className="h-4 w-4" />
              {stats.successRate}%
            </div>
            <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
          </CardContent>
        </Card>
      </div>

      {/* Blast Radius Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Proteções Ativas</p>
              <p className="text-xs text-muted-foreground">
                Blast Radius (max 10% da frota) • Circuit Breaker Global (30% em 10min) • Rollback disponível para ações reversíveis
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Histórico de Remediações
              </CardTitle>
              <CardDescription>Ações automáticas, manuais, aprovações e rollbacks</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por agente, ação..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredActions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>{search ? 'Nenhum resultado para a busca' : 'Nenhuma ação de remediação registrada'}</p>
              {!search && (
                <p className="text-xs mt-1">Use o botão "Nova Remediação" para disparar a primeira ação</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ação</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActions.map(action => {
                      const actionMeta = ACTION_LABELS[action.action_type as RemediationActionType] || { label: action.action_type, icon: '⚙️' };
                      const statusMeta = STATUS_MAP[action.status] || { label: action.status, variant: 'outline' as const };
                      const canRollback = (action.status === 'success' || action.status === 'executing') &&
                        ROLLBACK_SUPPORTED.includes(action.action_type as RemediationActionType);

                      return (
                        <TableRow key={action.id}>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <span>{actionMeta.icon}</span>
                              <span className="font-medium">{actionMeta.label}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{action.agent_name || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {action.trigger_source.startsWith('rollback:') ? '↩️ Rollback' :
                               action.trigger_source === 'manual_dashboard' ? '👤 Manual' :
                               action.trigger_source.startsWith('approved:') ? '✅ Aprovado' :
                               action.trigger_source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(action.created_at), { addSuffix: true, locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {action.status === 'pending' && action.requires_approval && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveAction.mutate(action.id)}
                                disabled={approveAction.isPending}
                                className="gap-1"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Aprovar
                              </Button>
                            )}
                            {canRollback && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => rollbackAction.mutate(action.id)}
                                    disabled={rollbackAction.isPending}
                                    className="gap-1 text-orange-500 hover:text-orange-600"
                                  >
                                    <Undo2 className="h-3 w-3" />
                                    Reverter
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reverter esta ação de remediação</TooltipContent>
                              </Tooltip>
                            )}
                            {action.error_message && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="h-4 w-4 text-destructive inline" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {action.error_message}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
