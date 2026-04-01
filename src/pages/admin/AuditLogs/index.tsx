import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, History, Search, Filter, CheckCircle, XCircle, Download, Eye, FileCheck } from 'lucide-react';
import { formatBrazilDateTime, TIMEZONE_INDICATOR } from '@/lib/date-utils';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StateDiffViewer } from '@/components/admin/audit/StateDiffViewer';
import { IntegrityBadge } from '@/components/admin/audit/IntegrityBadge';
import { ChainHealthPanel } from '@/components/admin/audit/ChainHealthPanel';
import { useAuditLogs } from './useAuditLogs';

export default function AuditLogs() {
  const {
    activeTenant, tenantLoading,
    logs, isLoading, users,
    page, setPage, totalPages,
    actionFilter, setActionFilter,
    userFilter, setUserFilter,
    searchInput, setSearchInput,
    isExporting, handleExportCSV, handleExportCertificate,
    getActionLabel, getResourceLabel,
  } = useAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <History className="h-8 w-8" />
          Histórico de Atividades
        </h2>
        <p className="text-muted-foreground flex items-center gap-1">
          Registro de todas as ações realizadas no sistema
          <HelpTooltip term="auditoria" />
        </p>
      </div>

      {activeTenant?.id && <ChainHealthPanel tenantId={activeTenant.id} />}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filtros</CardTitle>
            <CardDescription>Refine sua busca no histórico de atividades</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por ação ou recurso..." value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(0); }} className="pl-10" />
              </div>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue placeholder="Todas as ações" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="agent_enrolled">Computador Cadastrado</SelectItem>
                  <SelectItem value="agent_enrollment_failed">Falha no Cadastro</SelectItem>
                  <SelectItem value="job_created">Tarefa Criada</SelectItem>
                  <SelectItem value="job_creation_denied">Tarefa Negada</SelectItem>
                  <SelectItem value="update_role">Permissão Alterada</SelectItem>
                  <SelectItem value="cleanup_agent">Limpeza de Computador</SelectItem>
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue placeholder="Todos os usuários" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>{user.full_name || 'Usuário sem nome'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Registros</CardTitle>
              <CardDescription className="flex items-center gap-2">
                Mostrando {logs?.data?.length || 0} de {logs?.count || 0} atividades
                {activeTenant?.id && <IntegrityBadge tenantId={activeTenant.id} loading={tenantLoading} />}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting || !logs?.data?.length} className="gap-2">
                <Download className={cn("h-4 w-4", isExporting && "animate-spin")} />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCertificate} disabled={!activeTenant?.id} className="gap-2">
                <FileCheck className="h-4 w-4" />Certificado
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground"><History className="h-8 w-8 animate-spin mx-auto mb-2" />Carregando histórico...</div>
            ) : logs?.data?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><History className="h-12 w-12 mx-auto mb-2 opacity-20" />Nenhuma atividade encontrada com os filtros selecionados.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora {TIMEZONE_INDICATOR}</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>O que foi alterado</TableHead>
                      <TableHead>Mudança</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs?.data?.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-mono">{formatBrazilDateTime(log.created_at, 'full')}</TableCell>
                        <TableCell className="font-medium">{log.actor?.full_name || 'Sistema Automático'}</TableCell>
                        <TableCell><Badge variant="outline" className="font-normal">{getActionLabel(log.action)}</Badge></TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{getResourceLabel(log.resource_type)}</div>
                            {log.resource_id && <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={log.resource_id}>ID: {log.resource_id.substring(0, 8)}...</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(log.state_before || log.state_after) ? (
                            <Dialog>
                              <DialogTrigger asChild><Button variant="ghost" size="sm" className="gap-1"><Eye className="h-3 w-3" />Ver</Button></DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Detalhes da Alteração</DialogTitle>
                                  <DialogDescription>{getActionLabel(log.action)} em {getResourceLabel(log.resource_type)}</DialogDescription>
                                </DialogHeader>
                                <StateDiffViewer stateBefore={log.state_before as Record<string, unknown> | null} stateAfter={log.state_after as Record<string, unknown> | null} />
                              </DialogContent>
                            </Dialog>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1"><CheckCircle className="h-3 w-3" />Sucesso</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Falha</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{log.ip_address || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="gap-2"><ChevronLeft className="h-4 w-4" />Anterior</Button>
                    <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="gap-2">Próxima<ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
