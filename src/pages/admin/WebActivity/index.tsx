import { useState, useMemo, useRef, useCallback } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useWebActivity } from '@/hooks/useWebActivity';
import { useBlockedWebsites } from '@/hooks/useBlockedWebsites';
import { useBlockedAttempts } from '@/hooks/useBlockedAttempts';
import { useBlockedAttemptsRealtime } from '@/hooks/useBlockedAttemptsRealtime';
import { useAgentGroups } from '@/hooks/useAgentGroups';
import { useAgentSnapshots } from '@/hooks/useAgentSnapshots';
import { prepareJobForInsert } from '@/lib/job-utils';
import ThreatIntelligenceLookup from '@/components/admin/ThreatIntelligenceLookup';
import { BlockedSitesStats } from '@/components/admin/BlockedSitesStats';
import { AgentSyncStatusCard } from '@/components/admin/AgentSyncStatusCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Globe, Ban, Search, ShieldAlert, Filter, Eye, Shield, RefreshCw, ShieldX,
  BarChart3, Users, FileText, FileSpreadsheet
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { getCategoryForDomain, WEBSITE_CATEGORIES } from '@/lib/website-categories';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { exportToCSV } from '@/lib/csv-export';
import { logger } from '@/lib/logger';

import type { SortField, SortDir, EnrichedActivity } from './types';
import { ITEMS_PER_PAGE } from './types';
import { WebActivityCharts } from './WebActivityCharts';
import { BlockSiteForm } from './BlockSiteForm';
import { WebActivityTable } from './WebActivityTable';
import { exportWebActivityPDF, exportSitePDF } from './exportWebPDF';

export default function WebActivity() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [domainToBlock, setDomainToBlock] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [threatTarget, setThreatTarget] = useState('');
  const threatSectionRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<string>('activity');
  const [sortField, setSortField] = useState<SortField>('hits');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isCollectingAll, setIsCollectingAll] = useState(false);

  const { data: activity, isLoading, error } = useWebActivity(selectedAgent, !!selectedAgent);
  const { blockedWebsites, blockWebsite, unblockWebsite, isBlocked } = useBlockedWebsites();
  const { groups } = useAgentGroups();
  const { data: allSnapshots } = useAgentSnapshots();
  const { attempts: blockedAttempts, todayStats: blockedStats } = useBlockedAttempts({
    agentId: selectedAgent || undefined, limit: 500,
  });
  const { stats: globalStats } = useBlockedAttempts({ limit: 1000 });
  useBlockedAttemptsRealtime(true);

  const onlineAgents = useMemo(() => {
    if (!allSnapshots) return [];
    return allSnapshots.filter(s => {
      const state = s.agent_state;
      return state === 'online' || state === 'warning' || state === 'healthy' || state === 'enforcing' || state === 'degraded' || state === 'recovery' || s.online === true;
    });
  }, [allSnapshots]);

  const handleCollectAllWebActivity = useCallback(async () => {
    if (onlineAgents.length === 0) { toast.error('Nenhum computador online para coletar'); return; }
    setIsCollectingAll(true);
    try {
      const tenantId = onlineAgents[0]?.tenant_id;
      if (!tenantId) throw new Error('Tenant não identificado');
      const agentIds = onlineAgents.map(a => a.agent_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2589 workaround
      await (supabase as Record<string, any>).from('jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('type', 'collect_web_activity').in('status', ['queued', 'pending']).in('agent_id', agentIds);
      const jobs = await Promise.all(
        onlineAgents.map(agent => prepareJobForInsert({ tenant_id: tenantId, agent_id: agent.agent_id, agent_name: agent.hostname || 'unknown', type: 'collect_web_activity', status: 'queued', priority: 8, payload: { max_domains: 500, browsers: ['chrome', 'firefox', 'edge', 'brave', 'opera', 'vivaldi'], days_back: 30, source: 'manual-bulk' }, approved: true }))
      );
      const { error: insertError } = await supabase.from('jobs').insert(jobs);
      if (insertError) throw insertError;
      toast.success(`Coleta disparada para ${onlineAgents.length} computador${onlineAgents.length > 1 ? 'es' : ''}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('Bulk collect error:', err);
      toast.error('Erro ao disparar coleta', { description: msg });
    } finally { setIsCollectingAll(false); }
  }, [onlineAgents]);

  const enrichedActivity = useMemo<EnrichedActivity[]>(() => {
    if (!activity) return [];
    return activity.map(item => ({ ...item, category: getCategoryForDomain(item.domain), isBlocked: isBlocked(item.domain) }));
  }, [activity, isBlocked]);

  const filteredActivity = useMemo(() => {
    let filtered = enrichedActivity;
    if (searchTerm) filtered = filtered.filter(item => item.domain.toLowerCase().includes(searchTerm.toLowerCase()));
    if (categoryFilter !== 'all') filtered = filtered.filter(item => item.category.key === categoryFilter);
    return filtered;
  }, [enrichedActivity, searchTerm, categoryFilter]);

  const sortedActivity = useMemo(() => {
    const sorted = [...filteredActivity];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'domain': cmp = a.domain.localeCompare(b.domain); break;
        case 'category': cmp = (a.category.name || '').localeCompare(b.category.name || ''); break;
        case 'hits': cmp = a.hits - b.hits; break;
        case 'last_seen_at': cmp = new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime(); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [filteredActivity, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedActivity.length / ITEMS_PER_PAGE));
  const paginatedActivity = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedActivity.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedActivity, currentPage]);

  // Reset page when filters change
  useMemo(() => { setCurrentPage(1); }, [searchTerm, categoryFilter, sortField, sortDir, selectedAgent]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const categoryStats = useMemo(() => {
    const stats = new Map<string, { name: string; value: number; color: string }>();
    for (const item of enrichedActivity) {
      const existing = stats.get(item.category.key);
      if (existing) { existing.value += item.hits; }
      else {
        stats.set(item.category.key, {
          name: item.category.name, value: item.hits,
          color: item.category.color.includes('blue') ? '#3b82f6' : item.category.color.includes('red') ? '#ef4444' : item.category.color.includes('green') ? '#22c55e' : item.category.color.includes('yellow') ? '#eab308' : item.category.color.includes('purple') ? '#a855f7' : item.category.color.includes('orange') ? '#f97316' : item.category.color.includes('pink') ? '#ec4899' : item.category.color.includes('cyan') ? '#06b6d4' : item.category.color.includes('indigo') ? '#6366f1' : item.category.color.includes('amber') ? '#f59e0b' : '#6b7280',
        });
      }
    }
    return Array.from(stats.values()).sort((a, b) => b.value - a.value);
  }, [enrichedActivity]);

  const topDomains = filteredActivity.slice(0, 10);
  const totalHits = filteredActivity.reduce((sum, item) => sum + item.hits, 0);
  const blockedCount = filteredActivity.filter(item => item.isBlocked).length;

  const handleBlockSite = (domain: string) => { setDomainToBlock(domain); setBlockReason(''); setSelectedGroupId(null); setBlockDialogOpen(true); };
  const handleAnalyzeDomain = (domain: string) => {
    setThreatTarget(domain);
    setTimeout(() => { threatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  };
  const confirmBlock = async () => { await blockWebsite.mutateAsync({ domain_pattern: domainToBlock, reason: blockReason || undefined, group_id: selectedGroupId }); setBlockDialogOpen(false); };

  const syncBlockedWebsitesMutation = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.functions.invoke('sync-blocked-websites', { body: {} }); if (error) throw error; return data; },
    onSuccess: (data: any) => { toast.success((data?.message as string) || 'Sincronização agendada com sucesso'); },
    onError: (error: Error) => { toast.error(`Erro ao sincronizar: ${error.message}`); },
  });

  const handleExportCSV = () => {
    if (!filteredActivity.length) { toast.error('Nenhum dado para exportar'); return; }
    try {
      exportToCSV(filteredActivity.map(item => ({ domain: item.domain, category: item.category?.name || 'Desconhecido', hits: item.hits, first_seen: formatBrazilDateTime(item.first_seen_at), last_seen: formatBrazilDateTime(item.last_seen_at), status: item.isBlocked ? 'Bloqueado' : 'Permitido' })), 'relatorio-web-activity', [{ key: 'domain', label: 'Domínio' }, { key: 'category', label: 'Categoria' }, { key: 'hits', label: 'Acessos' }, { key: 'first_seen', label: 'Primeiro Acesso' }, { key: 'last_seen', label: 'Último Acesso' }, { key: 'status', label: 'Status' }]);
      toast.success('Relatório CSV exportado com sucesso');
    } catch { toast.error('Erro ao exportar CSV'); }
  };

  const handleExportPDF = () => exportWebActivityPDF(filteredActivity, totalHits, blockedCount);
  const handleExportSitePDF = (domain: string) => {
    const siteData = filteredActivity.find(item => item.domain === domain);
    if (!siteData) { toast.error('Dados do site não encontrados'); return; }
    exportSitePDF(domain, siteData);
  };

  const handleUnblockSite = (domain: string) => {
    const blocked = blockedWebsites?.find(b => domain.includes(b.domain_pattern) || b.domain_pattern.includes(domain));
    if (blocked) unblockWebsite.mutate(blocked.id);
  };

  return (
    <AdminPageLayout title="Atividade Web" description="Visualize e gerencie domínios acessados pelos agentes">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">
            <Eye className="h-3 w-3" />Modo Registro — Acessos são registrados, bloqueio requer configuração manual
          </Badge>
          <Button variant="default" size="sm" onClick={handleCollectAllWebActivity} disabled={isCollectingAll || onlineAgents.length === 0}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isCollectingAll ? 'animate-spin' : ''}`} />
            Atualizar Todos ({onlineAgents.length} online)
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="activity" className="gap-2"><Globe className="h-4 w-4" />Atividade Web</TabsTrigger>
            <TabsTrigger value="stats" className="gap-2"><BarChart3 className="h-4 w-4" />Dashboard de Bloqueios</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-6 space-y-6">
            <BlockedSitesStats stats={globalStats} />
            <AgentSyncStatusCard />
          </TabsContent>

          <TabsContent value="activity" className="mt-6 space-y-6">
            <Card className="border-l-4 border-l-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Selecionar Computador</CardTitle>
                <CardDescription>Escolha um computador para visualizar atividade web</CardDescription>
              </CardHeader>
              <CardContent><AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} /></CardContent>
            </Card>

            {!selectedAgent && (
              <Card className="border-l-4 border-l-muted">
                <CardContent className="py-12">
                  <div className="text-center space-y-3">
                    <Globe className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <div>
                      <h3 className="font-medium text-lg">Selecione um computador</h3>
                      <p className="text-muted-foreground text-sm">Escolha um computador acima para visualizar a atividade de navegação web.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedAgent && (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-l-4 border-l-primary"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Domínios Únicos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{filteredActivity.length}</div></CardContent></Card>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="border-l-4 border-l-accent"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total de Acessos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalHits}</div></CardContent></Card>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <Card className="border-l-4 border-l-info"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Média por Domínio</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{filteredActivity.length ? Math.round(totalHits / filteredActivity.length) : 0}</div></CardContent></Card>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="border-l-4 border-l-destructive"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1"><ShieldAlert className="h-4 w-4" />Sites Bloqueados</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{blockedCount}</div></CardContent></Card>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <Card className="border-l-4 border-l-warning bg-warning/5"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1"><ShieldX className="h-4 w-4 text-warning" />Tentativas Bloqueadas Hoje</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-warning">{blockedStats.totalAttempts}</div><p className="text-xs text-muted-foreground mt-1">{blockedStats.uniqueDomains} domínios • {blockedStats.uniqueAgents} computadores</p></CardContent></Card>
                  </motion.div>
                </div>

                {blockedStats.totalAttempts > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                    <Alert className="border-warning bg-warning/10">
                      <ShieldX className="h-4 w-4 text-warning" />
                      <AlertDescription className="text-warning-foreground">
                        <strong>{blockedStats.totalAttempts} tentativa(s) de acesso bloqueada(s) hoje.</strong> Os sites bloqueados foram impedidos via arquivo hosts nos computadores monitorados.
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {/* Filters */}
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filtros</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Buscar domínio..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as Categorias</SelectItem>
                            {WEBSITE_CATEGORIES.map((cat) => (<SelectItem key={cat.key} value={cat.key}>{cat.icon} {cat.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="default" onClick={handleExportCSV} disabled={!filteredActivity.length} className="gap-2"><FileSpreadsheet className="h-4 w-4" />Exportar CSV</Button>
                        <Button variant="default" size="default" onClick={handleExportPDF} disabled={!filteredActivity.length} className="gap-2"><FileText className="h-4 w-4" />Exportar PDF</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div ref={threatSectionRef}><ThreatIntelligenceLookup initialTarget={threatTarget} /></div>

                <WebActivityCharts categoryStats={categoryStats} topDomains={topDomains} onExportSitePDF={handleExportSitePDF} />

                <BlockSiteForm groups={groups} blockWebsite={blockWebsite} />

                {/* Blocked Sites Management */}
                {blockedWebsites && blockedWebsites.length > 0 && (
                  <Card className="border-l-4 border-l-destructive">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Sites Bloqueados ({blockedWebsites.length})</CardTitle>
                          <CardDescription>Sites que serão bloqueados via arquivo hosts nos agentes</CardDescription>
                        </div>
                        <Button onClick={() => syncBlockedWebsitesMutation.mutate()} disabled={syncBlockedWebsitesMutation.isPending} variant="outline" size="sm" className="gap-1">
                          <RefreshCw className={`h-4 w-4 ${syncBlockedWebsitesMutation.isPending ? 'animate-spin' : ''}`} />
                          {syncBlockedWebsitesMutation.isPending ? 'Sincronizando...' : 'Sincronizar com Agentes'}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {blockedWebsites.map((site) => (
                          <Badge key={site.id} variant="destructive" className="flex items-center gap-2 py-1.5 px-3">
                            <Ban className="h-3 w-3" />{site.domain_pattern}
                            <button onClick={() => unblockWebsite.mutate(site.id)} className="ml-1 hover:bg-destructive-foreground/10 rounded-full p-0.5" title="Desbloquear">×</button>
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Blocked Access Attempts */}
                {blockedAttempts.length > 0 && (
                  <Card className="border-l-4 border-l-warning">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><ShieldX className="h-5 w-5 text-warning" />Tentativas de Acesso Bloqueadas ({blockedAttempts.length})</CardTitle>
                      <CardDescription>Registro de tentativas de acesso a sites bloqueados - evidência para compliance</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Domínio</TableHead><TableHead>Computador</TableHead><TableHead>Usuário</TableHead><TableHead>Bloqueado Por</TableHead><TableHead>Data/Hora (UTC-3)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {blockedAttempts.slice(0, 10).map((attempt) => (
                            <TableRow key={attempt.id} className="bg-warning/5">
                              <TableCell className="font-medium"><div className="flex items-center gap-2"><Ban className="h-4 w-4 text-destructive" />{attempt.domain}</div></TableCell>
                              <TableCell>{attempt.agent_name}</TableCell>
                              <TableCell className="text-muted-foreground">{attempt.user_name || '-'}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{attempt.blocked_by === 'hosts_file' ? 'Arquivo Hosts' : attempt.blocked_by === 'firewall' ? 'Firewall' : attempt.blocked_by === 'dns' ? 'DNS' : attempt.blocked_by}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatBrazilDateTime(attempt.attempted_at, 'datetime')}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {blockedAttempts.length > 10 && <p className="text-sm text-muted-foreground mt-3 text-center">Exibindo 10 de {blockedAttempts.length} tentativas</p>}
                    </CardContent>
                  </Card>
                )}

                <WebActivityTable
                  isLoading={isLoading}
                  error={error}
                  filteredActivity={filteredActivity}
                  paginatedActivity={paginatedActivity}
                  sortField={sortField}
                  sortDir={sortDir}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onSort={handleSort}
                  onPageChange={setCurrentPage}
                  onAnalyzeDomain={handleAnalyzeDomain}
                  onBlockSite={handleBlockSite}
                  onUnblockSite={handleUnblockSite}
                  onExportCSV={handleExportCSV}
                  onExportPDF={handleExportPDF}
                  sortedActivityLength={sortedActivity.length}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Block Site Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-destructive" />Bloquear Site</DialogTitle>
            <DialogDescription>{selectedGroupId ? 'O domínio será bloqueado apenas para os computadores do grupo selecionado.' : 'O domínio será bloqueado em todos os computadores.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">Domínio</Label>
              <Input value={domainToBlock} onChange={(e) => setDomainToBlock(e.target.value)} placeholder="exemplo.com" />
              <p className="text-xs text-muted-foreground mt-1">Use *.dominio.com para bloquear todos os subdomínios</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Aplicar a</Label>
              <Select value={selectedGroupId || 'all'} onValueChange={(value) => setSelectedGroupId(value === 'all' ? null : value)}>
                <SelectTrigger><SelectValue placeholder="Selecione o escopo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><div className="flex items-center gap-2"><Globe className="h-4 w-4" />Todos os computadores</div></SelectItem>
                  {groups?.map((group) => (<SelectItem key={group.id} value={group.id}><div className="flex items-center gap-2"><Users className="h-4 w-4" />{group.name}</div></SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{selectedGroupId ? 'Apenas computadores deste grupo serão afetados' : 'Todos os computadores do tenant receberão este bloqueio'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Motivo (opcional)</Label>
              <Textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex: Conteúdo inapropriado, Distração no trabalho..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmBlock} disabled={!domainToBlock || blockWebsite.isPending}>{blockWebsite.isPending ? 'Bloqueando...' : 'Bloquear Site'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
