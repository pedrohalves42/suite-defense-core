import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, TrendingDown, Users, BarChart3 } from 'lucide-react';
import { useJobFailureStats } from '@/hooks/useJobFailureStats';
import { cn } from '@/lib/utils';

function getRateBadge(rate: number) {
  if (rate >= 50) return <Badge variant="destructive">{rate}%</Badge>;
  if (rate >= 30) return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">{rate}%</Badge>;
  return <Badge variant="secondary">{rate}%</Badge>;
}

export function JobFailureAnalysis() {
  const [groupByAgent, setGroupByAgent] = useState(false);
  const [daysBack, setDaysBack] = useState(30);
  const { data: stats, isLoading } = useJobFailureStats(groupByAgent, daysBack);

  const criticalTypes = (stats || []).filter(s => s.failure_rate >= 40 && s.total_jobs >= 5);
  const totalWastedJobs = criticalTypes.reduce((sum, s) => sum + s.failed_jobs, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              Análise de Taxa de Falha
            </CardTitle>
            <CardDescription>
              {criticalTypes.length > 0 
                ? `${criticalTypes.length} tipos com falha ≥40% — ${totalWastedJobs} jobs desperdiçados`
                : 'Nenhum tipo com taxa de falha crítica'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="group-agent" className="text-xs">Por agente</Label>
              <Switch id="group-agent" checked={groupByAgent} onCheckedChange={setGroupByAgent} />
            </div>
            <div className="flex gap-1">
              {[7, 14, 30].map(d => (
                <Button
                  key={d}
                  variant={daysBack === d ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDaysBack(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !stats?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado disponível</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Tipo de Job</th>
                  {groupByAgent && <th className="pb-2 font-medium text-muted-foreground">Agente</th>}
                  <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Sucesso</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Falha</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Taxa</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row, i) => (
                  <tr key={`${row.job_type}-${row.agent_name}-${i}`} className={cn(
                    "border-b last:border-0",
                    row.failure_rate >= 50 && "bg-destructive/5",
                    row.failure_rate >= 40 && row.failure_rate < 50 && "bg-yellow-500/5"
                  )}>
                    <td className="py-2 font-mono text-xs">{row.job_type}</td>
                    {groupByAgent && <td className="py-2 text-xs">{row.agent_name || '—'}</td>}
                    <td className="py-2 text-right">{row.total_jobs}</td>
                    <td className="py-2 text-right text-green-600 dark:text-green-400">{row.completed_jobs}</td>
                    <td className="py-2 text-right text-destructive">{row.failed_jobs}</td>
                    <td className="py-2 text-right">{getRateBadge(row.failure_rate)}</td>
                    <td className="py-2 text-right">
                      {row.failure_rate >= 50 && row.total_jobs >= 3 ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Bloqueado
                        </Badge>
                      ) : row.failure_rate >= 40 ? (
                        <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 text-[10px]">
                          Atenção
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Normal</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
