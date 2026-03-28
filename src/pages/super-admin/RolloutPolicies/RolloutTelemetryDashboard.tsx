import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, TrendingUp, TrendingDown, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { format, ptBR } from '@/lib/date-utils';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

export function RolloutTelemetryDashboard() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const [selectedDecision, setSelectedDecision] = useState<string>('all');

  const { data: decisions, isLoading } = useQuery({
    queryKey: ['rollout-decisions', selectedDecision],
    queryFn: async () => {
      let query = supabase
        .from('agent_update_decisions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (selectedDecision !== 'all') query = query.eq('decision', selectedDecision);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: adaptiveInterval,
  });

  const stats = {
    total: decisions?.length || 0,
    allowed: decisions?.filter(d => d.decision === 'allowed').length || 0,
    skipped: decisions?.filter(d => d.decision === 'skipped').length || 0,
    alreadyCurrent: decisions?.filter(d => d.decision === 'already_current').length || 0,
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'allowed': return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><TrendingUp className="h-3 w-3 mr-1" />Permitido</Badge>;
      case 'skipped': return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><TrendingDown className="h-3 w-3 mr-1" />Bloqueado</Badge>;
      case 'already_current': return <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Atual</Badge>;
      case 'no_policy': return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Sem Policy</Badge>;
      default: return <Badge variant="outline">{decision}</Badge>;
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-32"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-4 bg-muted/50 rounded-lg"><p className="text-sm text-muted-foreground">Total Decisões</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20"><p className="text-sm text-green-600">Permitidos</p><p className="text-2xl font-bold text-green-600">{stats.allowed}</p></div>
        <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20"><p className="text-sm text-yellow-600">Bloqueados (Rollout)</p><p className="text-2xl font-bold text-yellow-600">{stats.skipped}</p></div>
        <div className="p-4 bg-muted/50 rounded-lg"><p className="text-sm text-muted-foreground">Já Atualizados</p><p className="text-2xl font-bold">{stats.alreadyCurrent}</p></div>
      </div>

      <Tabs value={selectedDecision} onValueChange={setSelectedDecision}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="allowed">Permitidos</TabsTrigger>
          <TabsTrigger value="skipped">Bloqueados</TabsTrigger>
          <TabsTrigger value="already_current">Atualizados</TabsTrigger>
        </TabsList>
      </Tabs>

      {decisions && decisions.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead><TableHead>Plataforma</TableHead>
                <TableHead>Versão Atual</TableHead><TableHead>Versão Alvo</TableHead>
                <TableHead>Bucket</TableHead><TableHead>Rollout %</TableHead>
                <TableHead>Decisão</TableHead><TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-sm">{d.agent_name}</TableCell>
                  <TableCell><Badge variant="outline">{d.platform}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{d.current_version || 'N/A'}</TableCell>
                  <TableCell className="font-mono text-sm">{d.target_version}</TableCell>
                  <TableCell>{d.bucket}</TableCell>
                  <TableCell>{d.rollout_percentage}%</TableCell>
                  <TableCell>{getDecisionBadge(d.decision)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(d.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma decisão de rollout registrada ainda</p>
          <p className="text-sm">As decisões aparecerão quando agentes solicitarem updates</p>
        </div>
      )}
    </div>
  );
}
