import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Package, Settings, Search } from 'lucide-react';
import { useSoftwareRiskSummary, useSoftwareByRisk, useTopRiskySoftware, useSoftwarePolicy } from '@/hooks/useSoftwareRisk';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { RISK_CONFIG, CATEGORY_LABELS, POLICY_MODE_CONFIG } from './constants';
import { SoftwareRiskSummaryCards } from './SoftwareRiskSummaryCards';
import { SoftwareTopThreats } from './SoftwareTopThreats';
import { SoftwareListTable } from './SoftwareListTable';

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
  const highRiskCount = summary?.filter(s => s.risk_level === 'high' || s.risk_level === 'critical').reduce((acc, s) => acc + Number(s.count), 0) || 0;
  const classifiedCount = summary?.filter(s => s.risk_level !== 'unknown').reduce((acc, s) => acc + Number(s.count), 0) || 0;
  const unknownCount = Number(summary?.find(s => s.risk_level === 'unknown')?.count || 0);

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
    if (selectedCategory && (item as unknown as Record<string, unknown>).software_category !== selectedCategory) return false;
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
          <p className="text-muted-foreground">Classificação automática de programas instalados por nível de risco</p>
        </div>
        <div className="flex gap-2 items-center">
          {policyMode && (
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={cn('gap-1.5 py-1 px-3', policyMode.color)}>
                    <policyMode.icon className="h-3.5 w-3.5" />
                    Modo: {policyMode.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Política de proteção de software ativa</p>
                  {policy?.block_risk_levels?.length ? (
                    <p className="text-xs text-muted-foreground">Bloqueando: {policy.block_risk_levels.join(', ')}</p>
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

      <SoftwareRiskSummaryCards
        totalSoftware={totalSoftware}
        highRiskCount={highRiskCount}
        classifiedCount={classifiedCount}
        unknownCount={unknownCount}
      />

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
                <div className="h-64 flex items-center justify-center text-muted-foreground">Carregando...</div>
              ) : chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Nenhum software encontrado</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value"
                      onClick={(data) => {
                        const riskKey = Object.entries(RISK_CONFIG).find(([, v]) => v.label === data.name)?.[0];
                        setSelectedRisk(prev => prev === riskKey ? undefined : riskKey);
                      }}
                      className="cursor-pointer">
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} programas`, 'Quantidade']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
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
                      {summary?.filter(s => level === 'all' || s.risk_level === level)
                        .map(s =>
                          Object.entries(s.category_breakdown || {}).map(([cat, count]) => (
                            <button key={`${s.risk_level}-${cat}`}
                              onClick={() => {
                                setSelectedCategory(prev => prev === cat ? undefined : cat);
                                if (level !== 'all') setSelectedRisk(s.risk_level); else setSelectedRisk(undefined);
                                document.getElementById('software-list')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className={cn(
                                'flex items-center justify-between p-2 rounded-lg border bg-muted/30 transition-colors text-left',
                                'hover:bg-primary/10 hover:border-primary/40 cursor-pointer',
                                selectedCategory === cat && 'bg-primary/15 border-primary/50 ring-1 ring-primary/30'
                              )}>
                              <span className="text-sm truncate">{CATEGORY_LABELS[cat] || cat}</span>
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

      <SoftwareTopThreats topRisky={topRisky} />

      <SoftwareListTable
        filteredSoftware={filteredSoftware}
        softwareLoading={softwareLoading}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedAgent={selectedAgent}
        setSelectedAgent={setSelectedAgent}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedRisk={selectedRisk}
        setSelectedRisk={setSelectedRisk}
        agentsList={agentsList}
      />
    </div>
  );
}
