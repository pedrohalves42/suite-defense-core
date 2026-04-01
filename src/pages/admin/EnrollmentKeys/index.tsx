import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsGrid } from '@/components/ui/stats-grid';
import { SummaryStatCard } from '@/components/ui/summary-stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, XCircle, ChevronLeft, ChevronRight, TrendingUp, Key, Users, Clock, Trash, Loader2 } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useEnrollmentKeys, CountdownTimer } from './useEnrollmentKeys';

export default function EnrollmentKeys() {
  const h = useEnrollmentKeys();

  if (h.roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Chaves de Cadastro</h2>
          <p className="text-muted-foreground">Gerencie as chaves para cadastrar novos computadores</p>
        </div>
        <div className="flex gap-2">
          {h.canWrite && (
            <>
              <AlertDialog open={h.showCleanupDialog} onOpenChange={h.setShowCleanupDialog}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline"><Trash className="h-4 w-4 mr-2" />Limpar Expiradas</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Limpeza Manual</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acao ira remover permanentemente todas as enrollment keys que:
                      <ul className="list-disc ml-5 mt-2 space-y-1">
                        <li>Expiraram ha mais de 48 horas</li>
                        <li>Estao marcadas como inativas</li>
                      </ul>
                      <br />Esta acao nao pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={h.isCleaningUp}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={h.runManualCleanup} disabled={h.isCleaningUp}>
                      {h.isCleaningUp ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Limpando...</>) : 'Confirmar Limpeza'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={h.open} onOpenChange={h.setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Nova Chave</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Nova Chave</DialogTitle>
                    <DialogDescription>Configure os parametros para a nova chave de enrollment</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Expira em (horas)</Label><Input type="number" value={h.expiresInHours} onChange={(e) => h.setExpiresInHours(e.target.value)} min="1" /></div>
                    <div><Label>Usos maximos</Label><Input type="number" value={h.maxUses} onChange={(e) => h.setMaxUses(e.target.value)} min="1" /></div>
                    <div><Label>Descricao</Label><Textarea value={h.description} onChange={(e) => h.setDescription(e.target.value)} placeholder="Descricao opcional..." /></div>
                    <Button onClick={() => h.createKey.mutate()} disabled={h.createKey.isPending} className="w-full">Criar Chave</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <StatsGrid columns={4}>
        <SummaryStatCard label="Chaves Ativas" value={h.stats?.activeCount || 0} icon={Key} />
        <SummaryStatCard label="Criadas (30d)" value={h.stats?.recentCount || 0} icon={TrendingUp} />
        <SummaryStatCard label="Usadas (30d)" value={h.stats?.usedCount || 0} icon={Users} />
        <SummaryStatCard label="Total de Usos" value={h.stats?.totalUses || 0} icon={Clock} />
      </StatsGrid>

      <Card>
        <CardHeader><CardTitle>Filtros</CardTitle><CardDescription>Busque e filtre as chaves</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Buscar por descricao ou chave..." value={h.searchTerm} onChange={(e) => { h.setSearchTerm(e.target.value); h.setPage(0); }} />
            <Select value={h.statusFilter} onValueChange={(v) => { h.setStatusFilter(v); h.setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="inactive">Inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chaves de Enrollment</CardTitle>
          <CardDescription>Mostrando {h.keys?.data?.length || 0} de {h.keys?.count || 0} chaves</CardDescription>
        </CardHeader>
        <CardContent>
          {h.isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chave</TableHead>
                      <TableHead>Descricao</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usos</TableHead>
                      <TableHead>Criado por</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Ultimo uso</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {h.keys?.data?.map((key: any) => {
                      const isExpired = new Date(key.expires_at) < new Date();
                      const isMaxUsed = key.current_uses >= key.max_uses;
                      return (
                        <TableRow key={key.id}>
                          <TableCell className="font-mono text-sm">{key.key_masked}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{key.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={key.is_active && !isExpired && !isMaxUsed ? 'default' : 'secondary'}>
                              {!key.is_active ? 'Revogada' : isExpired ? 'Expirada' : isMaxUsed ? 'Esgotada' : 'Ativa'}
                            </Badge>
                          </TableCell>
                          <TableCell>{key.current_uses}/{key.max_uses}</TableCell>
                          <TableCell>{key.creator_name || '-'}</TableCell>
                          <TableCell className="text-sm">{formatBrazilDateTime(key.created_at, 'short')}</TableCell>
                          <TableCell className="text-sm">{key.used_at ? formatBrazilDateTime(key.used_at, 'short') : '-'}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground">{formatBrazilDateTime(key.expires_at, 'short')}</span>
                              <CountdownTimer expiresAt={key.expires_at} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {h.canWrite && key.is_active && (
                              <Button size="sm" variant="ghost" onClick={() => h.revokeKey.mutate(key)} disabled={h.revokeKey.isPending} title="Revogar chave">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {h.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button variant="outline" size="sm" onClick={() => h.setPage(p => Math.max(0, p - 1))} disabled={h.page === 0}>
                    <ChevronLeft className="h-4 w-4 mr-2" />Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">Pagina {h.page + 1} de {h.totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => h.setPage(p => Math.min(h.totalPages - 1, p + 1))} disabled={h.page >= h.totalPages - 1}>
                    Proxima<ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
