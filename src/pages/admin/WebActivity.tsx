import { useState, useMemo } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useWebActivity } from '@/hooks/useWebActivity';
import { useBlockedWebsites } from '@/hooks/useBlockedWebsites';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertCircle, 
  Globe, 
  TrendingUp, 
  Ban, 
  Search, 
  ShieldAlert,
  Filter,
  Clock,
  Eye
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

export default function WebActivity() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [domainToBlock, setDomainToBlock] = useState('');
  const [blockReason, setBlockReason] = useState('');
  
  const { data: activity, isLoading, error } = useWebActivity(selectedAgent, !!selectedAgent);
  const { blockedWebsites, blockWebsite, unblockWebsite, isBlocked } = useBlockedWebsites();

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
    setBlockDialogOpen(true);
  };

  const confirmBlock = async () => {
    await blockWebsite.mutateAsync({
      domain_pattern: domainToBlock,
      reason: blockReason || undefined,
    });
    setBlockDialogOpen(false);
  };

  return (
    <AdminPageLayout
      title="Atividade Web"
      description="Visualize e gerencie domínios acessados pelos agentes"
    >
      <div className="space-y-6">
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
            </div>

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

            {/* Blocked Sites Management */}
            {blockedWebsites && blockedWebsites.length > 0 && (
              <Card className="border-l-4 border-l-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    Sites Bloqueados ({blockedWebsites.length})
                  </CardTitle>
                  <CardDescription>Sites que serão bloqueados via arquivo hosts nos agentes</CardDescription>
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
                        <TableHead>Acessos</TableHead>
                        <TableHead>
                          <Clock className="h-4 w-4 inline mr-1" />
                          Primeira Visita
                        </TableHead>
                        <TableHead>
                          <Clock className="h-4 w-4 inline mr-1" />
                          Última Visita
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
                          <TableCell>
                            <Badge variant="outline">{item.hits}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(item.first_seen_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(item.last_seen_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
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
              O domínio será bloqueado via arquivo hosts em todos os agentes do seu tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Domínio</label>
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
              <label className="text-sm font-medium">Motivo (opcional)</label>
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
