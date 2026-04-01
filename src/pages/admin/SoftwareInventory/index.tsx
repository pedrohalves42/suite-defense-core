import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useSoftwareInventory } from '@/hooks/useSoftwareInventory';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Package, Search, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Shield, Eye, Bell, ShieldBan } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { prepareJobForInsert } from '@/lib/job-utils';
import { motion } from 'framer-motion';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { useSoftwarePolicy, useUpdateSoftwarePolicy, type SoftwareProtectionMode } from '@/hooks/useSoftwarePolicy';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const getRiskVariant = (risk: string): "default" | "secondary" | "destructive" | "warning" | "success" => {
  switch (risk.toLowerCase()) {
    case 'critical': return 'destructive';
    case 'high': return 'warning';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'secondary';
  }
};

const getRiskLabel = (risk: string): string => {
  switch (risk.toLowerCase()) {
    case 'critical': return 'Crítico';
    case 'high': return 'Alto';
    case 'medium': return 'Médio';
    case 'low': return 'Baixo';
    default: return 'Desconhecido';
  }
};

const getRiskIcon = (risk: string) => {
  switch (risk.toLowerCase()) {
    case 'critical': return <ShieldX className="h-4 w-4" />;
    case 'high': return <ShieldAlert className="h-4 w-4" />;
    case 'medium': return <Shield className="h-4 w-4" />;
    case 'low': return <ShieldCheck className="h-4 w-4" />;
    default: return <Shield className="h-4 w-4" />;
  }
};

export default function SoftwareInventory() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const { tenant } = useTenant();
  const { data: policy } = useSoftwarePolicy();
  const updatePolicy = useUpdateSoftwarePolicy();
  
  const { data: agents } = useQuery({
    queryKey: ['agents-list-for-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: false });
      if (error) throw error;
      return ((data || []) as unknown[]).map((agent: any) => ({ id: agent.id, agent_name: agent.agent_name }));
    },
    enabled: !!tenant?.id
  });
  
  const { data: software, isLoading, error } = useSoftwareInventory(selectedAgent, !!selectedAgent);

  const createJobMutation = useMutation({
    mutationFn: async (agentId: string) => {
      if (!tenant) throw new Error('Empresa não encontrada');
      const agent = agents?.find(a => a.id === agentId);
      if (!agent) throw new Error('Agente não encontrado');

      const { data: existingJob } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('agent_id', agentId)
        .eq('type', 'software_inventory_collect')
        .in('status', ['pending', 'queued', 'delivered', 'running'])
        .maybeSingle();

      if (existingJob) throw new Error(`DEDUP:Já existe uma coleta em andamento (${existingJob.status}). Aguarde a conclusão.`);
      
      const jobData = await prepareJobForInsert({
        agent_id: agentId, agent_name: agent.agent_name,
        type: 'software_inventory_collect', status: 'queued',
        tenant_id: tenant.id, approved: true, payload: {},
      });

      const { error } = await supabase.from('jobs').insert(jobData);
      if (error) throw error;
    },
    onSuccess: () => toast.success('Coleta de programas iniciada! Aguarde alguns minutos.'),
    onError: (error) => {
      if (error.message.startsWith('DEDUP:')) toast.info(error.message.replace('DEDUP:', ''));
      else toast.error(`Erro ao iniciar coleta: ${error.message}`);
    },
  });

  const filteredSoftware = software?.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.vendor?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'all' || item.risk_level.toLowerCase() === riskFilter;
    return matchesSearch && matchesRisk;
  }) || [];

  const riskCounts = software?.reduce((acc, item) => {
    const risk = item.risk_level.toLowerCase();
    acc[risk] = (acc[risk] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <AdminPageLayout title="Programas Instalados" description="Veja todos os programas instalados nos seus computadores protegidos">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={`gap-2 text-xs transition-colors ${policy?.mode === 'block' ? 'border-destructive/50 text-destructive' : policy?.mode === 'alert' ? 'border-primary/50 text-primary' : 'border-amber-500/50 text-amber-600 dark:text-amber-400'}`} disabled={updatePolicy.isPending}>
                {policy?.mode === 'block' ? <><ShieldBan className="h-3.5 w-3.5" /> Modo Bloqueio — Impede software de risco</> : policy?.mode === 'alert' ? <><Bell className="h-3.5 w-3.5" /> Modo Alerta — Notifica sobre software de risco</> : <><Eye className="h-3.5 w-3.5" /> Modo Observação — Não bloqueia instalação de software</>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => updatePolicy.mutate({ mode: 'observation' })}><Eye className="h-4 w-4 text-amber-500" /><div><p className="font-medium">Observação</p><p className="text-xs text-muted-foreground">Apenas monitora, sem ações automáticas</p></div></DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => updatePolicy.mutate({ mode: 'alert' })}><Bell className="h-4 w-4 text-primary" /><div><p className="font-medium">Alerta</p><p className="text-xs text-muted-foreground">Gera alertas para software de risco</p></div></DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => updatePolicy.mutate({ mode: 'block' })}><ShieldBan className="h-4 w-4 text-destructive" /><div><p className="font-medium">Bloqueio</p><p className="text-xs text-muted-foreground">Bloqueia execução de software crítico/alto</p></div></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Selecionar Computador</CardTitle>
                <CardDescription className="flex items-center gap-1">Escolha um computador para ver os programas instalados<HelpTooltip term="inventário de software" /></CardDescription>
              </div>
              {selectedAgent && (
                <Button onClick={() => createJobMutation.mutate(selectedAgent)} disabled={createJobMutation.isPending} size="sm" className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${createJobMutation.isPending ? 'animate-spin' : ''}`} />Atualizar Lista
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent><AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} /></CardContent>
        </Card>

        {selectedAgent && (
          <>
            <div className="grid gap-4 md:grid-cols-5">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-l-4 border-l-primary hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Package className="h-4 w-4" />Total de Programas</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{software?.length || 0}</div><p className="text-xs text-muted-foreground">instalados</p></CardContent>
                </Card>
              </motion.div>
              {[
                { key: 'critical', label: 'Crítico', color: 'border-l-destructive', bgColor: 'bg-destructive/5' },
                { key: 'high', label: 'Alto', color: 'border-l-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-950/20' },
                { key: 'medium', label: 'Médio', color: 'border-l-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-950/20' },
                { key: 'low', label: 'Baixo', color: 'border-l-green-500', bgColor: 'bg-green-50 dark:bg-green-950/20' },
              ].map((risk, idx) => (
                <motion.div key={risk.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (idx + 1) * 0.1 }}>
                  <Card className={`${risk.color} ${risk.bgColor} hover:shadow-md transition-shadow`}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2">{getRiskIcon(risk.key)}Risco {risk.label}</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{riskCounts[risk.key] || 0}</div><p className="text-xs text-muted-foreground">programas</p></CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" />Filtrar Programas</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Digite o nome do programa ou fabricante..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Filtrar por risco" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os níveis</SelectItem>
                      <SelectItem value="critical"><div className="flex items-center gap-2"><ShieldX className="h-4 w-4 text-destructive" />Crítico ({riskCounts['critical'] || 0})</div></SelectItem>
                      <SelectItem value="high"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-500" />Alto ({riskCounts['high'] || 0})</div></SelectItem>
                      <SelectItem value="medium"><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-yellow-500" />Médio ({riskCounts['medium'] || 0})</div></SelectItem>
                      <SelectItem value="low"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-500" />Baixo ({riskCounts['low'] || 0})</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(searchTerm || riskFilter !== 'all') && <p className="text-xs text-muted-foreground mt-2">{filteredSoftware.length} programa(s) encontrado(s)</p>}
              </CardContent>
            </Card>

            {isLoading ? (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 animate-pulse" />Carregando programas...</CardTitle></CardHeader>
                <CardContent className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent>
              </Card>
            ) : error ? (
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Erro ao carregar inventario: {error instanceof Error ? error.message : 'Erro desconhecido'}</AlertDescription></Alert>
            ) : filteredSoftware.length === 0 ? (
              <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>{searchTerm ? `Nenhum programa encontrado para "${searchTerm}". Tente outro termo.` : 'Nenhum programa encontrado. Clique em "Atualizar Lista" para coletar os dados.'}</AlertDescription></Alert>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Lista de Programas</CardTitle>
                  <CardDescription>{filteredSoftware.length} programa(s) instalado(s) neste computador</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome do Programa</TableHead>
                        <TableHead>Versão</TableHead>
                        <TableHead>Fabricante</TableHead>
                        <TableHead className="hidden lg:table-cell">Local de Instalação</TableHead>
                        <TableHead><span className="flex items-center gap-1">Nível de Risco<HelpTooltip term="score de risco" /></span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSoftware.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="font-mono text-sm">{item.version || 'N/A'}</TableCell>
                          <TableCell>{item.vendor || 'Desconhecido'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-md truncate hidden lg:table-cell" title={item.install_location || ''}>{item.install_location || '-'}</TableCell>
                          <TableCell><Badge variant={getRiskVariant(item.risk_level)} className="flex items-center gap-1 w-fit">{getRiskIcon(item.risk_level)}{getRiskLabel(item.risk_level)}</Badge></TableCell>
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
    </AdminPageLayout>
  );
}
