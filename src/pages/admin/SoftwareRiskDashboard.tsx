import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, AlertTriangle, AlertOctagon, CheckCircle, 
  HelpCircle, RefreshCw, Monitor, Package, Settings
} from 'lucide-react';
import { useSoftwareRiskSummary, useSoftwareByRisk } from '@/hooks/useSoftwareRisk';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

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
  adware: 'Adware',
  gaming: 'Jogos',
  uncategorized: 'Não Categorizado',
};

export default function SoftwareRiskDashboard() {
  const [selectedRisk, setSelectedRisk] = useState<string | undefined>(undefined);
  
  const { data: summary, isLoading: summaryLoading, refetch } = useSoftwareRiskSummary();
  const { data: software, isLoading: softwareLoading } = useSoftwareByRisk(selectedRisk, 100);

  const totalSoftware = summary?.reduce((acc, s) => acc + Number(s.count), 0) || 0;
  const highRiskCount = summary?.filter(s => s.risk_level === 'high' || s.risk_level === 'critical')
    .reduce((acc, s) => acc + Number(s.count), 0) || 0;

  const chartData = summary?.map(s => ({
    name: RISK_CONFIG[s.risk_level]?.label || s.risk_level,
    value: Number(s.count),
    color: RISK_CONFIG[s.risk_level]?.color || 'hsl(var(--muted))',
  })) || [];

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
        <div className="flex gap-2">
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
              <div className="text-3xl font-bold">
                {summary?.filter(s => s.risk_level !== 'unknown').reduce((acc, s) => acc + Number(s.count), 0) || 0}
              </div>
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
              <div className="text-3xl font-bold text-muted-foreground">
                {summary?.find(s => s.risk_level === 'unknown')?.count || 0}
              </div>
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
                            <div 
                              key={`${s.risk_level}-${cat}`}
                              className="flex items-center justify-between p-2 rounded-lg border bg-muted/30"
                            >
                              <span className="text-sm truncate">
                                {CATEGORY_LABELS[cat] || cat}
                              </span>
                              <Badge variant="secondary">{count as number}</Badge>
                            </div>
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

      {/* Software List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              {selectedRisk 
                ? `Software - ${RISK_CONFIG[selectedRisk]?.label || selectedRisk}`
                : 'Todos os Programas'}
            </CardTitle>
            <CardDescription>
              {selectedRisk && (
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-sm"
                  onClick={() => setSelectedRisk(undefined)}
                >
                  Limpar filtro
                </Button>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {softwareLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : software?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum software encontrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Computador</TableHead>
                    <TableHead>Risco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {software?.slice(0, 50).map((item) => {
                    const risk = RISK_CONFIG[item.risk_level || 'unknown'];
                    const Icon = risk?.icon || HelpCircle;
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {item.version || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.vendor || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {item.agents?.agent_name || '-'}
                          </Badge>
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
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
