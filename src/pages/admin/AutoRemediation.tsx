import { useState } from 'react';
import { useAutoRemediation, type RemediationActionType } from '@/hooks/useAutoRemediation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Zap, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ACTION_LABELS: Record<RemediationActionType, { label: string; icon: string }> = {
  kill_process: { label: 'Encerrar Processo', icon: '🔪' },
  firewall_block: { label: 'Bloquear Firewall', icon: '🧱' },
  patch_apply: { label: 'Aplicar Patch', icon: '🩹' },
  quarantine_file: { label: 'Quarentena', icon: '🔒' },
  restart_service: { label: 'Reiniciar Serviço', icon: '🔄' },
};

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'outline' },
  executing: { label: 'Executando', variant: 'secondary' },
  success: { label: 'Sucesso', variant: 'default' },
  failed: { label: 'Falha', variant: 'destructive' },
  rolled_back: { label: 'Revertido', variant: 'destructive' },
};

export default function AutoRemediationPage() {
  const { actions, isLoading, approveAction } = useAutoRemediation();

  const stats = {
    total: actions.length,
    success: actions.filter(a => a.status === 'success').length,
    pending: actions.filter(a => a.status === 'pending').length,
    failed: actions.filter(a => a.status === 'failed').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Auto-Remediação
        </h1>
        <p className="text-muted-foreground mt-1">
          Motor closed-loop de remediação automática de ameaças
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total de Ações</p>
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
      </div>

      {/* Actions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Histórico de Remediações
          </CardTitle>
          <CardDescription>Ações automáticas e aprovações pendentes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhuma ação de remediação registrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map(action => {
                    const actionMeta = ACTION_LABELS[action.action_type as RemediationActionType] || { label: action.action_type, icon: '⚙️' };
                    const statusMeta = STATUS_MAP[action.status] || { label: action.status, variant: 'outline' as const };

                    return (
                      <TableRow key={action.id}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span>{actionMeta.icon}</span>
                            <span className="font-medium">{actionMeta.label}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{action.agent_name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{action.trigger_source}</TableCell>
                        <TableCell>
                          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(action.created_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {action.status === 'pending' && action.requires_approval && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveAction.mutate(action.id)}
                              disabled={approveAction.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Aprovar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
