import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, RefreshCw, Trash2, CheckCircle, RotateCcw, Eye, Inbox, Zap, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { getJobTypeLabel } from '@/lib/job-labels';
import { Progress } from '@/components/ui/progress';
import { useDeadLetterQueue } from './useDeadLetterQueue';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Aguardando', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  retrying: { label: 'Tentando', variant: 'default', icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
  exhausted: { label: 'Esgotado', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  resolved: { label: 'Resolvido', variant: 'outline', icon: <CheckCircle2 className="h-3 w-3" /> },
};

export default function DeadLetterQueue() {
  const {
    entries, isLoading, refetch, isFetching,
    statusFilter, setStatusFilter,
    selectedEntry, setSelectedEntry,
    resolveNotes, setResolveNotes,
    showResolveDialog, setShowResolveDialog,
    showDetailsDialog, setShowDetailsDialog,
    resolveMutation, retryMutation, deleteMutation, bulkRetryMutation,
    triggerAutoRetry, statusCounts, resolutionRate,
  } = useDeadLetterQueue();

  return (
    <AdminPageLayout title="Fila de Tarefas Pendentes" description="Gerencie jobs que falharam e aguardam retry">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(statusConfig).map(([status, config]) => (
            <Card
              key={status}
              className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === status ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <span className="text-sm text-muted-foreground">{config.label}</span>
                  </div>
                  <Badge variant={config.variant}>{statusCounts[status] || 0}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10">
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Taxa de Resolução</span>
                  <span className="text-lg font-bold text-green-600">{resolutionRate}%</span>
                </div>
                <Progress value={resolutionRate} className="h-1" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pending">Aguardando</SelectItem>
              <SelectItem value="retrying">Tentando</SelectItem>
              <SelectItem value="exhausted">Esgotado</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={triggerAutoRetry} disabled={(statusCounts['pending'] ?? 0) === 0}>
              <Zap className="h-4 w-4 mr-2" />Processar Retries
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkRetryMutation.mutate()} disabled={bulkRetryMutation.isPending || ((statusCounts['pending'] ?? 0) + (statusCounts['exhausted'] ?? 0)) === 0}>
              <RotateCcw className="h-4 w-4 mr-2" />Reenviar Lote (até 10)
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />Atualizar
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Verificações com Falha</CardTitle>
            <CardDescription>
              Verificações que falharam e foram movidas para nova tentativa.
              {(statusCounts['pending'] ?? 0) > 0 && (
                <span className="text-primary"> {statusCounts['pending']} aguardando próxima tentativa.</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : entries?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma verificação com falha na fila</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Computador</TableHead>
                    <TableHead>Tipo de Verificação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Última Falha</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.agent_name}</TableCell>
                      <TableCell><Badge variant="outline">{getJobTypeLabel(entry.job_type)}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[entry.status]?.variant || 'secondary'} className="flex items-center gap-1 w-fit">
                          {statusConfig[entry.status]?.icon}
                          {statusConfig[entry.status]?.label || entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={entry.retry_count >= entry.max_retries ? 'text-destructive' : ''}>
                          {entry.retry_count} / {entry.max_retries}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(entry.last_failure_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedEntry(entry); setShowDetailsDialog(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {entry.status !== 'resolved' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => retryMutation.mutate(entry)} disabled={retryMutation.isPending}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => { setSelectedEntry(entry); setShowResolveDialog(true); }}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(entry.status === 'exhausted' || entry.status === 'resolved') && (
                            <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(entry.id)} disabled={deleteMutation.isPending}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Verificação</DialogTitle>
            <DialogDescription>Informações sobre a falha e erro ocorrido</DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Computador</label><p className="text-sm text-muted-foreground">{selectedEntry.agent_name}</p></div>
                <div><label className="text-sm font-medium">Tipo de Verificação</label><p className="text-sm text-muted-foreground">{getJobTypeLabel(selectedEntry.job_type)}</p></div>
                <div><label className="text-sm font-medium">Primeira Falha</label><p className="text-sm text-muted-foreground">{formatRelativeTime(selectedEntry.first_failure_at)}</p></div>
                <div><label className="text-sm font-medium">Total de Erros</label><p className="text-sm text-muted-foreground">{selectedEntry.error_count}</p></div>
              </div>
              <div>
                <label className="text-sm font-medium">Error Message</label>
                <div className="mt-1 p-3 bg-destructive/10 rounded-md text-sm font-mono text-destructive">
                  <AlertCircle className="h-4 w-4 inline mr-2" />{selectedEntry.error_message || 'No error message'}
                </div>
              </div>
              {selectedEntry.payload && (
                <div>
                  <label className="text-sm font-medium">Payload</label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-40">{JSON.stringify(selectedEntry.payload, null, 2)}</pre>
                </div>
              )}
              {selectedEntry.resolution_notes && (
                <div>
                  <label className="text-sm font-medium">Resolution Notes</label>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">{selectedEntry.resolution_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Resolved</DialogTitle>
            <DialogDescription>Add notes explaining how this issue was resolved</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Resolution notes (optional)" value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>Cancel</Button>
            <Button onClick={() => selectedEntry && resolveMutation.mutate({ id: selectedEntry.id, notes: resolveNotes })} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? 'Resolving...' : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
