import { useState, useMemo, useRef } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useWebActivity } from '@/hooks/useWebActivity';
import { useBlockedWebsites } from '@/hooks/useBlockedWebsites';
import { useBlockedAttempts } from '@/hooks/useBlockedAttempts';
import { useBlockedAttemptsRealtime } from '@/hooks/useBlockedAttemptsRealtime';
import { useAgentGroups } from '@/hooks/useAgentGroups';
import ThreatIntelligenceLookup from '@/components/admin/ThreatIntelligenceLookup';
import { BlockedSitesStats } from '@/components/admin/BlockedSitesStats';
import { AgentSyncStatusCard } from '@/components/admin/AgentSyncStatusCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { 
  AlertCircle, 
  Globe, 
  TrendingUp, 
  Ban, 
  Search, 
  ShieldAlert,
  Filter,
  Clock,
  Eye,
  Shield,
  RefreshCw,
  ShieldX,
  BarChart3,
  Users,
  Download,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { getCategoryForDomain, WEBSITE_CATEGORIES } from '@/lib/website-categories';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { exportToCSV } from '@/lib/csv-export';
import { loadLogoForPDF, addLogoToPDF } from '@/lib/pdfLogoHelper';

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
  
  // Manual block form states
  const [manualDomain, setManualDomain] = useState('');
  const [manualGroupId, setManualGroupId] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState('');
  const [isManualBlocking, setIsManualBlocking] = useState(false);
  
  const { data: activity, isLoading, error } = useWebActivity(selectedAgent, !!selectedAgent);
  const { blockedWebsites, blockWebsite, unblockWebsite, isBlocked } = useBlockedWebsites();
  const { groups } = useAgentGroups();
  const { attempts: blockedAttempts, todayStats: blockedStats, stats: fullStats, isLoading: attemptsLoading } = useBlockedAttempts({ 
    agentId: selectedAgent || undefined,
    limit: 500
  });
  
  // Global stats (all agents)
  const { stats: globalStats } = useBlockedAttempts({ limit: 1000 });
  
  // Enable realtime notifications for blocked attempts
  useBlockedAttemptsRealtime(true);

  // Enrich activity with categories
  const enrichedActivity = useMemo(() => {
    if (!activity) return [];
    return activity.map(item => ({
      ...item,
      category: getCategoryForDomain(item.domain),
      isBlocked: isBlocked(item.domain),
    }));
  }, [activity, isBlocked]);

  // Filter activity
  const filteredActivity = useMemo(() => {
    let filtered = enrichedActivity;
    
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.domain.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category.key === categoryFilter);
    }
    
    return filtered;
  }, [enrichedActivity, searchTerm, categoryFilter]);

  // Category stats for chart
  const categoryStats = useMemo(() => {
    const stats = new Map<string, { name: string; value: number; color: string }>();
    
    for (const item of enrichedActivity) {
      const existing = stats.get(item.category.key);
      if (existing) {
        existing.value += item.hits;
      } else {
        stats.set(item.category.key, {
          name: item.category.name,
          value: item.hits,
          color: item.category.color.includes('blue') ? '#3b82f6' :
                 item.category.color.includes('red') ? '#ef4444' :
                 item.category.color.includes('green') ? '#22c55e' :
                 item.category.color.includes('yellow') ? '#eab308' :
                 item.category.color.includes('purple') ? '#a855f7' :
                 item.category.color.includes('orange') ? '#f97316' :
                 item.category.color.includes('pink') ? '#ec4899' :
                 item.category.color.includes('cyan') ? '#06b6d4' :
                 item.category.color.includes('indigo') ? '#6366f1' :
                 item.category.color.includes('amber') ? '#f59e0b' :
                 '#6b7280',
        });
      }
    }
    
    return Array.from(stats.values()).sort((a, b) => b.value - a.value);
  }, [enrichedActivity]);

  const topDomains = filteredActivity.slice(0, 10);
  const totalHits = filteredActivity.reduce((sum, item) => sum + item.hits, 0);
  const blockedCount = filteredActivity.filter(item => item.isBlocked).length;

  const handleBlockSite = (domain: string) => {
    setDomainToBlock(domain);
    setBlockReason('');
    setSelectedGroupId(null);
    setBlockDialogOpen(true);
  };

  const handleAnalyzeDomain = (domain: string) => {
    setThreatTarget(domain);
    setTimeout(() => {
      threatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const confirmBlock = async () => {
    await blockWebsite.mutateAsync({
      domain_pattern: domainToBlock,
      reason: blockReason || undefined,
      group_id: selectedGroupId,
    });
    setBlockDialogOpen(false);
  };

  // Mutation to sync blocked websites with agents
  const syncBlockedWebsitesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-blocked-websites', {
        body: {}
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Sincronização agendada com sucesso');
    },
    onError: (error: any) => {
      toast.error(`Erro ao sincronizar: ${error.message}`);
    }
  });

  const handleExportCSV = () => {
    if (!filteredActivity.length) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    try {
      exportToCSV(
        filteredActivity.map(item => ({
          domain: item.domain,
          category: item.category?.name || 'Desconhecido',
          hits: item.hits,
          first_seen: formatBrazilDateTime(item.first_seen_at),
          last_seen: formatBrazilDateTime(item.last_seen_at),
          status: item.isBlocked ? 'Bloqueado' : 'Permitido',
        })),
        'relatorio-web-activity',
        [
          { key: 'domain', label: 'Domínio' },
          { key: 'category', label: 'Categoria' },
          { key: 'hits', label: 'Acessos' },
          { key: 'first_seen', label: 'Primeiro Acesso' },
          { key: 'last_seen', label: 'Último Acesso' },
          { key: 'status', label: 'Status' },
        ]
      );
      toast.success('Relatório CSV exportado com sucesso');
    } catch (err) {
      toast.error('Erro ao exportar CSV');
    }
  };

  const handleExportPDF = async () => {
    if (!filteredActivity.length) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const logoDataUrl = await loadLogoForPDF();

      // Header
      addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 8, 16);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Atividade Web', pageWidth / 2, 32, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em: ${formatBrazilDateTime(new Date().toISOString())}`, pageWidth / 2, 39, { align: 'center' });
      doc.text(`Total: ${filteredActivity.length} domínios | ${totalHits} acessos | ${blockedCount} bloqueados`, pageWidth / 2, 45, { align: 'center' });

      // Table
      autoTable(doc, {
        startY: 52,
        head: [['Domínio', 'Categoria', 'Acessos', 'Primeiro Acesso', 'Último Acesso', 'Status']],
        body: filteredActivity.map(item => [
          item.domain,
          item.category?.name || 'Desconhecido',
          String(item.hits),
          formatBrazilDateTime(item.first_seen_at),
          formatBrazilDateTime(item.last_seen_at),
          item.isBlocked ? 'Bloqueado' : 'Permitido',
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: {
          0: { cellWidth: 60 },
          2: { halign: 'center', cellWidth: 20 },
          5: { cellWidth: 25 },
        },
      });

      doc.save(`relatorio-web-activity-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Relatório PDF exportado com sucesso');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Erro ao exportar PDF');
    }
  };

    <AdminPageLayout
      title="Atividade Web"
      description="Visualize e gerencie domínios acessados pelos agentes"
    >
      <div className="space-y-6">
        {/* Observation Label */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">
            <Eye className="h-3 w-3" />
            Modo Registro — Acessos são registrados, bloqueio requer configuração manual
          </Badge>
        </div>

        {/* Tabs for Activity vs Stats */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="activity" className="gap-2">
              <Globe className="h-4 w-4" />
              Atividade Web
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard de Bloqueios
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="stats" className="mt-6 space-y-6">
            {/* Global Blocked Sites Statistics Dashboard */}
            <BlockedSitesStats stats={globalStats} />
            
            {/* Agent Sync Status */}
            <AgentSyncStatusCard />
          </TabsContent>
          
          <TabsContent value="activity" className="mt-6 space-y-6">
            {/* Agent Selector */}
            <Card className="border-l-4 border-l-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Selecionar Computador
                </CardTitle>
                <CardDescription>Escolha um computador para visualizar atividade web</CardDescription>
              </CardHeader>
              <CardContent>
                <AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} />
              </CardContent>
            </Card>

            {!selectedAgent && (
              <Card className="border-l-4 border-l-muted">
                <CardContent className="py-12">
                  <div className="text-center space-y-3">
                    <Globe className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <div>
                      <h3 className="font-medium text-lg">Selecione um computador</h3>
                      <p className="text-muted-foreground text-sm">
                        Escolha um computador acima para visualizar a atividade de navegação web.
                      </p>
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
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Domínios Únicos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{filteredActivity.length}</div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="border-l-4 border-l-accent">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total de Acessos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalHits}</div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border-l-4 border-l-info">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Média por Domínio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {filteredActivity.length ? Math.round(totalHits / filteredActivity.length) : 0}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-l-4 border-l-destructive">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-1">
                      <ShieldAlert className="h-4 w-4" />
                      Sites Bloqueados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{blockedCount}</div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card className="border-l-4 border-l-warning bg-warning/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-1">
                      <ShieldX className="h-4 w-4 text-warning" />
                      Tentativas Bloqueadas Hoje
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-warning">{blockedStats.totalAttempts}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {blockedStats.uniqueDomains} domínios • {blockedStats.uniqueAgents} computadores
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Blocked Attempts Alert Banner */}
            {blockedStats.totalAttempts > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                <Alert className="border-warning bg-warning/10">
                  <ShieldX className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning-foreground">
                    <strong>{blockedStats.totalAttempts} tentativa(s) de acesso bloqueada(s) hoje.</strong> Os sites 
                    bloqueados foram impedidos via arquivo hosts nos computadores monitorados.
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar domínio..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="w-[200px]">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as Categorias</SelectItem>
                        {WEBSITE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.key} value={cat.key}>
                            {cat.icon} {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Threat Intelligence Analysis */}
            <div ref={threatSectionRef}>
              <ThreatIntelligenceLookup initialTarget={threatTarget} />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Category Pie Chart */}
              {categoryStats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Distribuição por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryStats}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={false}
                          >
                            {categoryStats.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => [`${value} acessos`, 'Total']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Domains Chart */}
              {topDomains.length > 0 && (
                <Card className="border-l-4 border-l-warning">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Top 10 Domínios
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topDomains.map((item, idx) => (
                        <div key={item.domain} className="flex items-center gap-3">
                          <Badge variant="outline" className="w-8 justify-center">
                            {idx + 1}
                          </Badge>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{item.domain}</span>
                                <Badge className={item.category.color} variant="outline">
                                  {item.category.icon}
                                </Badge>
                                {item.isBlocked && (
                                  <Badge variant="destructive" className="text-xs">
                                    <Ban className="h-3 w-3 mr-1" />
                                    Bloqueado
                                  </Badge>
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">{item.hits} acessos</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-info to-primary transition-all"
                                style={{ width: `${(item.hits / topDomains[0].hits) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Manual Block Site Form */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  Bloquear Novo Site
                </CardTitle>
                <CardDescription>
                  Digite um domínio para adicionar à lista de bloqueio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form 
                  className="flex flex-wrap items-end gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!manualDomain.trim()) {
                      toast.error('Digite um domínio para bloquear');
                      return;
                    }
                    setIsManualBlocking(true);
                    try {
                      await blockWebsite.mutateAsync({
                        domain_pattern: manualDomain.trim().toLowerCase(),
                        reason: manualReason || 'Bloqueio manual',
                        group_id: manualGroupId,
                        autoSync: true,
                      });
                      setManualDomain('');
                      setManualReason('');
                      setManualGroupId(null);
                      toast.success(`Site ${manualDomain} bloqueado com sucesso`);
                    } catch (error) {
                      toast.error(`Erro ao bloquear: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
                    } finally {
                      setIsManualBlocking(false);
                    }
                  }}
                >
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="manual-domain">Domínio</Label>
                    <Input 
                      id="manual-domain"
                      placeholder="exemplo.com ou *.exemplo.com"
                      value={manualDomain}
                      onChange={(e) => setManualDomain(e.target.value)}
                      disabled={isManualBlocking}
                    />
                  </div>
                  <div className="w-[200px]">
                    <Label htmlFor="manual-group">Aplicar a</Label>
                    <Select 
                      value={manualGroupId || 'all'} 
                      onValueChange={(v) => setManualGroupId(v === 'all' ? null : v)}
                      disabled={isManualBlocking}
                    >
                      <SelectTrigger id="manual-group">
                        <SelectValue placeholder="Todos os grupos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Todos os grupos
                          </div>
                        </SelectItem>
                        {groups?.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <Label htmlFor="manual-reason">Motivo (opcional)</Label>
                    <Input 
                      id="manual-reason"
                      placeholder="Política de segurança"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      disabled={isManualBlocking}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    variant="destructive"
                    disabled={isManualBlocking || !manualDomain.trim()}
                  >
                    {isManualBlocking ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Bloqueando...
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4 mr-2" />
                        Bloquear Site
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Blocked Sites Management */}
            {blockedWebsites && blockedWebsites.length > 0 && (
              <Card className="border-l-4 border-l-destructive">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5" />
                        Sites Bloqueados ({blockedWebsites.length})
                      </CardTitle>
                      <CardDescription>Sites que serão bloqueados via arquivo hosts nos agentes</CardDescription>
                    </div>
                    <Button
                      onClick={() => syncBlockedWebsitesMutation.mutate()}
                      disabled={syncBlockedWebsitesMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncBlockedWebsitesMutation.isPending ? 'animate-spin' : ''}`} />
                      {syncBlockedWebsitesMutation.isPending ? "Sincronizando..." : "Sincronizar com Agentes"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {blockedWebsites.map((site) => (
                      <Badge 
                        key={site.id} 
                        variant="destructive"
                        className="flex items-center gap-2 py-1.5 px-3"
                      >
                        <Ban className="h-3 w-3" />
                        {site.domain_pattern}
                        <button 
                          onClick={() => unblockWebsite.mutate(site.id)}
                          className="ml-1 hover:bg-destructive-foreground/10 rounded-full p-0.5"
                          title="Desbloquear"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Blocked Access Attempts Table */}
            {blockedAttempts.length > 0 && (
              <Card className="border-l-4 border-l-warning">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldX className="h-5 w-5 text-warning" />
                    Tentativas de Acesso Bloqueadas ({blockedAttempts.length})
                  </CardTitle>
                  <CardDescription>
                    Registro de tentativas de acesso a sites bloqueados - evidência para compliance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domínio</TableHead>
                        <TableHead>Computador</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Bloqueado Por</TableHead>
                        <TableHead>Data/Hora (UTC-3)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedAttempts.slice(0, 10).map((attempt) => (
                        <TableRow key={attempt.id} className="bg-warning/5">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Ban className="h-4 w-4 text-destructive" />
                              {attempt.domain}
                            </div>
                          </TableCell>
                          <TableCell>{attempt.agent_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {attempt.user_name || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {attempt.blocked_by === 'hosts_file' ? 'Arquivo Hosts' : 
                               attempt.blocked_by === 'firewall' ? 'Firewall' : 
                               attempt.blocked_by === 'dns' ? 'DNS' : attempt.blocked_by}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatBrazilDateTime(attempt.attempted_at, 'datetime')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {blockedAttempts.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-3 text-center">
                      Exibindo 10 de {blockedAttempts.length} tentativas
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Activity Table */}
            {isLoading ? (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Erro ao carregar atividade web: {error instanceof Error ? error.message : 'Erro desconhecido'}
                </AlertDescription>
              </Alert>
            ) : filteredActivity.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhuma atividade web encontrada para os filtros selecionados.
                </AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Todos os Domínios
                  </CardTitle>
                  <CardDescription>
                    Atividade completa das últimas 24 horas • {filteredActivity.length} domínios
                  </CardDescription>
                </CardHeader>
                <CardContent>
                <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domínio</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-center">Acessos</TableHead>
                        <TableHead>
                          <Clock className="h-4 w-4 inline mr-1" />
                          Primeira Visita (UTC-3)
                        </TableHead>
                        <TableHead>
                          <Clock className="h-4 w-4 inline mr-1" />
                          Última Visita (UTC-3)
                        </TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActivity.map((item) => (
                        <TableRow key={item.domain} className={item.isBlocked ? 'bg-destructive/5' : ''}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.domain}
                              {item.isBlocked && (
                                <Badge variant="destructive" className="text-xs">
                                  <Ban className="h-3 w-3 mr-1" />
                                  Bloqueado
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={item.category.color} variant="outline">
                              {item.category.icon} {item.category.name}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="font-mono">
                              {item.hits.toLocaleString('pt-BR')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatBrazilDateTime(item.first_seen_at, 'datetime')}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatBrazilDateTime(item.last_seen_at, 'datetime')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAnalyzeDomain(item.domain)}
                                title="Analisar ameaça"
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                              {!item.isBlocked ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleBlockSite(item.domain)}
                                >
                                  <Ban className="h-4 w-4 mr-1" />
                                  Bloquear
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const blocked = blockedWebsites?.find(b => 
                                      item.domain.includes(b.domain_pattern) || 
                                      b.domain_pattern.includes(item.domain)
                                    );
                                    if (blocked) unblockWebsite.mutate(blocked.id);
                                  }}
                                >
                                  Desbloquear
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
          </TabsContent>
        </Tabs>
      </div>
      {/* Block Site Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Bloquear Site
            </DialogTitle>
            <DialogDescription>
              {selectedGroupId 
                ? 'O domínio será bloqueado apenas para os computadores do grupo selecionado.'
                : 'O domínio será bloqueado em todos os computadores.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">Domínio</Label>
              <Input 
                value={domainToBlock} 
                onChange={(e) => setDomainToBlock(e.target.value)}
                placeholder="exemplo.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use *.dominio.com para bloquear todos os subdomínios
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Aplicar a</Label>
              <Select 
                value={selectedGroupId || 'all'} 
                onValueChange={(value) => setSelectedGroupId(value === 'all' ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Todos os computadores
                    </div>
                  </SelectItem>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {group.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedGroupId 
                  ? 'Apenas computadores deste grupo serão afetados'
                  : 'Todos os computadores do tenant receberão este bloqueio'}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Motivo (opcional)</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Ex: Conteúdo inapropriado, Distração no trabalho..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmBlock}
              disabled={!domainToBlock || blockWebsite.isPending}
            >
              {blockWebsite.isPending ? 'Bloqueando...' : 'Bloquear Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
