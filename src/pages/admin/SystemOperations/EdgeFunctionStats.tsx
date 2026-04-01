import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Zap, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EdgeFunctionStat } from './useSystemOperations';

interface EdgeFunctionStatsProps {
  stats: EdgeFunctionStat[];
}

export function EdgeFunctionStatsTable({ stats }: EdgeFunctionStatsProps) {
  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-500" />Latência de Edge Functions (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma métrica de latência registrada ainda.</p>
            <p className="text-sm">As métricas serão coletadas automaticamente.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-500" />Latência de Edge Functions (24h)</CardTitle>
        <CardDescription>Métricas de performance p50/p95/p99 em milissegundos</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Função</TableHead>
              <TableHead className="text-right">Chamadas</TableHead>
              <TableHead className="text-right">Taxa Sucesso</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p95</TableHead>
              <TableHead className="text-right">p99</TableHead>
              <TableHead className="text-right">Max</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((stat) => {
              const successRate = stat.total_calls > 0 ? Math.round((stat.successful_calls / stat.total_calls) * 100) : 100;
              return (
                <TableRow key={stat.function_name}>
                  <TableCell className="font-mono text-sm">{stat.function_name}</TableCell>
                  <TableCell className="text-right">{stat.total_calls}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={successRate >= 95 ? "default" : successRate >= 80 ? "secondary" : "destructive"}>{successRate}%</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{Math.round(stat.p50_latency_ms || 0)}ms</TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={cn((stat.p95_latency_ms || 0) > 1000 && "text-yellow-600")}>{Math.round(stat.p95_latency_ms || 0)}ms</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={cn((stat.p99_latency_ms || 0) > 2000 && "text-red-600")}>{Math.round(stat.p99_latency_ms || 0)}ms</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{Math.round(stat.max_latency_ms || 0)}ms</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
