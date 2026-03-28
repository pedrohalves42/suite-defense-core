import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { DNSFilterManager } from '@/components/admin/DNSFilterManager';
import { BlockedSitesStats } from '@/components/admin/BlockedSitesStats';
import { useBlockedWebsites } from '@/hooks/useBlockedWebsites';
import { useBlockedAttempts } from '@/hooks/useBlockedAttempts';
import { useBlockedAttemptsRealtime } from '@/hooks/useBlockedAttemptsRealtime';
import { useAgentGroups } from '@/hooks/useAgentGroups';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Shield, 
  Plus, 
  Trash2, 
  BarChart3, 
  Globe, 
  Settings,
  ShieldX,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { DNSControlProof } from '@/components/dns/DNSControlProof';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { toast } from 'sonner';

export default function DNSFilter() {
  const [activeTab, setActiveTab] = useState('manager');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newReason, setNewReason] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const { blockedWebsites, blockWebsite, unblockWebsite, isLoading } = useBlockedWebsites();
  const { stats: blockedStats, attempts } = useBlockedAttempts({ limit: 100 });
  const { groups } = useAgentGroups();
  
  // Enable realtime for blocked attempts
  useBlockedAttemptsRealtime(true);

  const handleAddDomain = async () => {
    if (!newDomain.trim()) {
      toast.error('Digite um domínio para bloquear');
      return;
    }

    await blockWebsite.mutateAsync({
      domain_pattern: newDomain.trim(),
      reason: newReason.trim() || undefined,
      group_id: selectedGroupId,
      autoSync: true,
    });

    setNewDomain('');
    setNewReason('');
    setSelectedGroupId(null);
    setAddDialogOpen(false);
  };

  const handleRemoveDomain = async (id: string) => {
    await unblockWebsite.mutateAsync(id);
  };

  return (
    <AdminPageLayout
      title="DNS Filter"
      description="Gerencie o bloqueio de websites via DNS local nos computadores"
    >
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
            <TabsTrigger value="manager" className="gap-2">
              <Settings className="h-4 w-4" />
              Gerenciar
            </TabsTrigger>
            <TabsTrigger value="sites" className="gap-2">
              <Globe className="h-4 w-4" />
              Sites Bloqueados
            </TabsTrigger>
            <TabsTrigger value="attempts" className="gap-2">
              <ShieldX className="h-4 w-4" />
              Tentativas
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Estatísticas
            </TabsTrigger>
            <TabsTrigger value="proof" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Prova de Controle
            </TabsTrigger>
          </TabsList>

          {/* Manager Tab - DNS Filter Status and Actions */}
          <TabsContent value="manager" className="mt-6">
            <DNSFilterManager />
          </TabsContent>

          {/* Blocked Sites List Tab */}
          <TabsContent value="sites" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Sites Bloqueados
                  </CardTitle>
                  <CardDescription>
                    Lista de domínios bloqueados em todos os computadores
                  </CardDescription>
                </div>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Domínio
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Bloquear Domínio</DialogTitle>
                      <DialogDescription>
                        Adicione um domínio para bloquear em todos os computadores
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="domain">Domínio</Label>
                        <Input
                          id="domain"
                          placeholder="exemplo.com ou *.exemplo.com"
                          value={newDomain}
                          onChange={(e) => setNewDomain(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use *.dominio.com para bloquear todos os subdomínios
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">Motivo (opcional)</Label>
                        <Textarea
                          id="reason"
                          placeholder="Motivo do bloqueio..."
                          value={newReason}
                          onChange={(e) => setNewReason(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="group">Grupo (opcional)</Label>
                        <Select value={selectedGroupId || 'all'} onValueChange={(v) => setSelectedGroupId(v === 'all' ? null : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos os computadores" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os computadores</SelectItem>
                            {groups?.map(group => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Aplique o bloqueio apenas a um grupo específico
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddDomain} disabled={blockWebsite.isPending}>
                        {blockWebsite.isPending ? 'Bloqueando...' : 'Bloquear'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domínio</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedWebsites?.map(site => (
                        <TableRow key={site.id}>
                          <TableCell>
                            <code className="px-2 py-1 rounded bg-muted text-sm">
                              {site.domain_pattern}
                            </code>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {site.reason || '-'}
                          </TableCell>
                          <TableCell>
                            {(site as never).agent_groups ? (
                              <Badge variant="outline" className="gap-1">
                                <Users className="h-3 w-3" />
                                {(site as never).agent_groups.name}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Todos</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatBrazilDateTime(site.created_at)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveDomain(site.id)}
                              disabled={unblockWebsite.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!blockedWebsites || blockedWebsites.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Nenhum site bloqueado. Clique em "Adicionar Domínio" para começar.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blocked Attempts Tab */}
          <TabsContent value="attempts" className="mt-6 space-y-6">
            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <ShieldX className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-destructive">{blockedStats.totalAttempts}</div>
                      <div className="text-xs text-muted-foreground">Tentativas Hoje</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <Globe className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-warning">{blockedStats.uniqueDomains}</div>
                      <div className="text-xs text-muted-foreground">Domínios Únicos</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-info/10">
                      <Users className="h-5 w-5 text-info" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-info">{blockedStats.uniqueAgents}</div>
                      <div className="text-xs text-muted-foreground">Computadores</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {attempts && attempts.length > 0 
                          ? formatBrazilDateTime(attempts[0].attempted_at).split(' ')[1] 
                          : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">Última Tentativa</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Attempts Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Tentativas de Acesso Bloqueadas
                </CardTitle>
                <CardDescription>
                  Histórico de tentativas de acesso a sites bloqueados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domínio</TableHead>
                        <TableHead>Computador</TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Fonte</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attempts?.map(attempt => (
                        <TableRow key={attempt.id}>
                          <TableCell>
                            <code className="px-2 py-1 rounded bg-destructive/10 text-destructive text-sm">
                              {attempt.domain}
                            </code>
                          </TableCell>
                          <TableCell className="font-medium">
                            {attempt.agent_name || 'Desconhecido'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatBrazilDateTime(attempt.attempted_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {attempt.source || 'dns'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!attempts || attempts.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            Nenhuma tentativa de acesso bloqueada registrada.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="mt-6">
            <BlockedSitesStats stats={blockedStats} />
          </TabsContent>

          {/* Proof Tab (P1-B) */}
          <TabsContent value="proof" className="mt-6">
            <DNSControlProof />
          </TabsContent>
        </Tabs>
      </div>
    </AdminPageLayout>
  );
}
