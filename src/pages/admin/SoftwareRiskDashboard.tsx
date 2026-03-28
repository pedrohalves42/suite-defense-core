import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Shield, AlertTriangle, AlertOctagon, CheckCircle, 
  HelpCircle, RefreshCw, Monitor, Package, Settings,
  Search, MapPin, Clock, Laptop, TrendingUp, ShieldAlert,
  Eye, Zap, Ban, FolderOpen
} from 'lucide-react';
import { useSoftwareRiskSummary, useSoftwareByRisk, useTopRiskySoftware, useSoftwarePolicy } from '@/hooks/useSoftwareRisk';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const RISK_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield; bgClass: string }> = {
  critical: { 
    label: 'Crítico', 
    color: 'hsl(var(--destructive))', 
    icon: AlertOctagon,
    bgClass: 'bg-destructive/10 text-destructive border-destructive/30'
  },
  high: { 
    label: 'Alto', 
    color: 'hsl(var(--warning))', 
    icon: AlertTriangle,
    bgClass: 'bg-orange-500/10 text-orange-600 border-orange-500/30'
  },
  medium: { 
    label: 'Médio', 
    color: 'hsl(45, 93%, 47%)', 
    icon: Shield,
    bgClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30'
  },
  low: { 
    label: 'Baixo', 
    color: 'hsl(var(--success))', 
    icon: CheckCircle,
    bgClass: 'bg-success/10 text-success border-success/30'
  },
  unknown: { 
    label: 'Não Classificado', 
    color: 'hsl(var(--muted-foreground))', 
    icon: HelpCircle,
    bgClass: 'bg-muted text-muted-foreground border-border'
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  remote_access: 'Acesso Remoto',
  p2p: 'P2P / Torrent',
  browser: 'Navegador',
  security: 'Segurança',
  utility: 'Utilitário',
  business: 'Negócios',
  meeting: 'Reuniões',
  messaging: 'Mensagens',
  development: 'Desenvolvimento',
  vpn_free: 'VPN Gratuita',
  vpn: 'VPN',
  adware: 'Adware',
  gaming: 'Jogos',
  anti_detect: 'Anti-Detect',
  virtualization: 'Virtualização',
  runtime: 'Runtime',
  system: 'Sistema',
  driver: 'Driver',
  network: 'Rede',
  multimedia: 'Multimídia',
  cloud_storage: 'Cloud Storage',
  peripheral: 'Periférico',
  uncategorized: 'Não Categorizado',
};

const POLICY_MODE_CONFIG: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  observation: { label: 'Observação', icon: Eye, color: 'text-blue-400' },
  alert: { label: 'Alerta', icon: Zap, color: 'text-amber-400' },
  block: { label: 'Bloqueio', icon: Ban, color: 'text-destructive' },
};

export default function SoftwareRiskDashboard() {
  const [selectedRisk, setSelectedRisk] = useState<string | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  
  const { data: summary, isLoading: summaryLoading, refetch } = useSoftwareRiskSummary();
  const { data: software, isLoading: softwareLoading } = useSoftwareByRisk(selectedRisk, 200);
  const { data: topRisky } = useTopRiskySoftware(8);
  const { data: policy } = useSoftwarePolicy();

  const totalSoftware = summary?.reduce((acc, s) => acc + Number(s.count), 0) || 0;
  const highRiskCount = summary?.filter(s => s.risk_level === 'high' || s.risk_level === 'critical')
    .reduce((acc, s) => acc + Number(s.count), 0) || 0;
  const classifiedCount = summary?.filter(s => s.risk_level !== 'unknown').reduce((acc, s) => acc + Number(s.count), 0) || 0;
  const unknownCount = Number(summary?.find(s => s.risk_level === 'unknown')?.count || 0);

  // Extract unique agents from software list
  const agentsList = useMemo(() => {
    if (!software) return [];
    const map = new Map<string, string>();
    for (const item of software) {
      if (item.agent_id && item.agents?.agent_name) {
        map.set(item.agent_id, item.agents.agent_name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [software]);

  const chartData = summary?.map(s => ({
    name: RISK_CONFIG[s.risk_level]?.label || s.risk_level,
    value: Number(s.count),
    color: RISK_CONFIG[s.risk_level]?.color || 'hsl(var(--muted))',
  })) || [];

  const filteredSoftware = software?.filter(item => {
    if (selectedAgent !== 'all' && item.agent_id !== selectedAgent) return false;
    if (selectedCategory && (item as any).software_category !== selectedCategory) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      (item.vendor?.toLowerCase().includes(term)) ||
      (item.install_location?.toLowerCase().includes(term)) ||
      (item.agents?.agent_name?.toLowerCase().includes(term))
    );
  }) || [];

  const policyMode = policy?.mode ? POLICY_MODE_CONFIG[policy.mode] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8" />
            Risco de Software
          </h2>
          <p className="text-muted-foreground">
            Classificação automática de programas instalados por nível de risco
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {policyMode && (
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={cn("gap-1.5 py-1 px-3", policyMode.color)}>
                    <policyMode.icon className="h-3.5 w-3.5" />
                    Modo: {policyMode.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Política de proteção de software ativa</p>
                  {policy?.block_risk_levels?.length ? (
                    <p className="text-xs text-muted-foreground">
                      Bloqueando: {policy.block_risk_levels.join(', ')}
                    </p>
                  ) : null}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/admin/software-knowledge-base">
              <Settings className="h-4 w-4" />
              Gerenciar Regras
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalSoftware}</div>
              <p className="text-xs text-muted-foreground">programas encontrados</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className={cn(highRiskCount > 0 && "border-destructive/50")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Alto Risco
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold", highRiskCount > 0 && "text-destructive")}>
                {highRiskCount}
              </div>
              <p className="text-xs text-muted-foreground">requer atenção</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Classificados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{classifiedCount}</div>
              <p className="text-xs text-muted-foreground">com classificação</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Não Classificados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-muted-foreground">{unknownCount}</div>
              <p className="text-xs text-muted-foreground">pendentes de análise</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pie Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Distribuição de Risco</CardTitle>
              <CardDescription>Clique para filtrar por categoria</CardDescription>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Carregando...
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Nenhum software encontrado
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(data) => {
                        const riskKey = Object.entries(RISK_CONFIG).find(
                          ([, v]) => v.label === data.name
                        )?.[0];
                        setSelectedRisk(prev => prev === riskKey ? undefined : riskKey);
                      }}
                      className="cursor-pointer"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`${value} programas`, 'Quantidade']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Por Categoria</CardTitle>
              <CardDescription>Distribuição por tipo de software</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="critical" className="text-destructive">Crítico</TabsTrigger>
                  <TabsTrigger value="high" className="text-orange-600">Alto</TabsTrigger>
                  <TabsTrigger value="medium" className="text-amber-600">Médio</TabsTrigger>
                  <TabsTrigger value="low" className="text-success">Baixo</TabsTrigger>
                </TabsList>

                {['all', 'critical', 'high', 'medium', 'low'].map(level => (
                  <TabsContent key={level} value={level} className="mt-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {summary
                        ?.filter(s => level === 'all' || s.risk_level === level)
                        .map(s => 
                          Object.entries(s.category_breakdown || {}).map(([cat, count]) => (
                            <button 
                              key={`${s.risk_level}-${cat}`}
                              onClick={() => {
                                setSelectedCategory(prev => prev === cat ? undefined : cat);
                                if (level !== 'all') setSelectedRisk(s.risk_level);
                                else setSelectedRisk(undefined);
                                // Scroll to software list
                                document.getElementById('software-list')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border bg-muted/30 transition-colors text-left",
                                "hover:bg-primary/10 hover:border-primary/40 cursor-pointer",
                                selectedCategory === cat && "bg-primary/15 border-primary/50 ring-1 ring-primary/30"
                              )}
                            >
                              <span className="text-sm truncate">
                                {CATEGORY_LABELS[cat] || cat}
                              </span>
                              <Badge variant="secondary">{count as number}</Badge>
                            </button>
                          ))
                        )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top Threats */}
      {topRisky && topRisky.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Principais Ameaças
              </CardTitle>
              <CardDescription>Software de alto risco com maior presença na frota</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {topRisky.map((item, i) => {
                  const risk = RISK_CONFIG[item.risk_level];
                  const Icon = risk?.icon || AlertTriangle;
                  return (
                    <div 
                      key={item.name}
                      className={cn(
                        "p-3 rounded-lg border flex flex-col gap-1.5",
                        risk?.bgClass
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold truncate flex-1">{item.name}</span>
                        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                      </div>
                      {item.vendor && (
                        <span className="text-xs opacity-70 truncate">{item.vendor}</span>
                      )}
                      <div className="flex items-center gap-3 text-xs mt-1">
                        <span className="flex items-center gap-1">
                          <Laptop className="h-3 w-3" />
                          {item.machine_count} {item.machine_count === 1 ? 'máquina' : 'máquinas'}
                        </span>
                        <span className="flex items-center gap-1 opacity-70">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(item.first_seen_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Software List */}
      <motion.div id="software-list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    {selectedCategory
                      ? `Programas - ${CATEGORY_LABELS[selectedCategory] || selectedCategory}`
                      : selectedRisk 
                        ? `Programas - ${RISK_CONFIG[selectedRisk]?.label || selectedRisk}`
                        : 'Todos os Programas'}
                    <Badge variant="secondary" className="ml-2">{filteredSoftware.length}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 flex gap-2">
                    {selectedCategory && (
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-sm"
                        onClick={() => setSelectedCategory(undefined)}
                      >
                        Limpar filtro de categoria
                      </Button>
                    )}
                    {selectedRisk && (
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-sm"
                        onClick={() => setSelectedRisk(undefined)}
                      >
                        Limpar filtro de risco
                      </Button>
                    )}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <div className="w-64">
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <Laptop className="h-4 w-4 mr-2 shrink-0" />
                      <SelectValue placeholder="Todos os computadores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">🖥️ Todos os computadores</SelectItem>
                      {agentsList.map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          💻 {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, fornecedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {softwareLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredSoftware.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm || selectedAgent !== 'all' ? 'Nenhum resultado para os filtros aplicados' : 'Nenhum software encontrado'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Versão</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Caminho</TableHead>
                      {selectedAgent === 'all' && <TableHead>Computador</TableHead>}
                      <TableHead>Visto</TableHead>
                      <TableHead>Risco</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSoftware.slice(0, 100).map((item) => {
                      const risk = RISK_CONFIG[item.risk_level || 'unknown'];
                      const Icon = risk?.icon || HelpCircle;
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">{item.name}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {item.version || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                            {item.vendor || '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {item.install_location ? (
                              <TooltipProvider>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                                      <FolderOpen className="h-3 w-3 shrink-0" />
                                      <span className="truncate max-w-[160px]">{item.install_location}</span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-sm">
                                    <p className="font-mono text-xs break-all">{item.install_location}</p>
                                  </TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </TableCell>
                          {selectedAgent === 'all' && (
                            <TableCell>
                              <Badge variant="outline" className="font-normal text-xs">
                                {item.agents?.agent_name || '-'}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell>
                            <TooltipProvider>
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground cursor-help">
                                    {formatDistanceToNow(new Date(item.last_seen_at), { addSuffix: true, locale: ptBR })}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    Primeiro: {new Date(item.first_seen_at).toLocaleDateString('pt-BR')}
                                  </p>
                                  <p className="text-xs">
                                    Último: {new Date(item.last_seen_at).toLocaleDateString('pt-BR')}
                                  </p>
                                </TooltipContent>
                              </UITooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={cn("gap-1", risk?.bgClass)}
                            >
                              <Icon className="h-3 w-3" />
                              {risk?.label || 'Desconhecido'}
                            </Badge>
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
      </motion.div>
    </div>
  );
}
