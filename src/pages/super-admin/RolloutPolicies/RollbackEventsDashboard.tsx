import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, RotateCcw, RefreshCw } from "lucide-react";
import { format, ptBR } from '@/lib/date-utils';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

export function RollbackEventsDashboard() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { data: rollbacks, isLoading } = useQuery({
    queryKey: ['rollback-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_rollback_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const safeModeAgents = rollbacks?.filter(r => r.safe_mode_triggered) || [];
  const recentRollbacks = rollbacks?.filter(r => !r.safe_mode_triggered) || [];

  if (isLoading) return <div className="flex items-center justify-center h-32"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {safeModeAgents.length > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <span className="font-semibold text-red-500">Agentes em Safe Mode</span>
          </div>
          <div className="space-y-2">
            {safeModeAgents.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="font-mono">{r.agent_name}</span>
                <Badge variant="destructive">Safe Mode - {r.rollback_count} rollbacks</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-4 bg-muted/50 rounded-lg"><p className="text-sm text-muted-foreground">Total Rollbacks</p><p className="text-2xl font-bold">{rollbacks?.length || 0}</p></div>
        <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20"><p className="text-sm text-red-600">Em Safe Mode</p><p className="text-2xl font-bold text-red-600">{safeModeAgents.length}</p></div>
        <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20"><p className="text-sm text-yellow-600">Rollbacks Recentes</p><p className="text-2xl font-bold text-yellow-600">{recentRollbacks.length}</p></div>
      </div>

      {rollbacks && rollbacks.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead><TableHead>De</TableHead><TableHead>Para</TableHead>
                <TableHead>Motivo</TableHead><TableHead>Count</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rollbacks.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.agent_name}</TableCell>
                  <TableCell className="font-mono text-sm">{r.from_version}</TableCell>
                  <TableCell className="font-mono text-sm">{r.to_version}</TableCell>
                  <TableCell><Badge variant="outline">{r.reason}</Badge></TableCell>
                  <TableCell>{r.rollback_count}</TableCell>
                  <TableCell>{r.safe_mode_triggered ? <Badge variant="destructive">Safe Mode</Badge> : <Badge variant="secondary">Rollback</Badge>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum evento de rollback registrado</p>
          <p className="text-sm">Rollbacks aparecerão quando agentes detectarem problemas pós-update</p>
        </div>
      )}
    </div>
  );
}
