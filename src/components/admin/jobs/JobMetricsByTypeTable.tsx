import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JobMetricsByType } from '@/hooks/useJobsHealth';

// Job type labels in Portuguese
const jobTypeLabels: Record<string, string> = {
  'health_report': 'Relatório de Saúde',
  'software_inventory_collect': 'Inventário de Software',
  'light_vuln_scan': 'Análise de Vulnerabilidades',
  'collect_antivirus_status': 'Status do Antivírus',
  'collect_web_activity': 'Atividade Web',
  'collect_network_info': 'Informações de Rede',
  'collect_disk_metrics': 'Métricas de Disco',
  'recovery_check': 'Verificação de Recuperação',
  'heartbeat': 'Heartbeat',
};

interface JobMetricsByTypeTableProps {
  metrics: JobMetricsByType[];
  isLoading?: boolean;
}

export function JobMetricsByTypeTable({ metrics, isLoading }: JobMetricsByTypeTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!metrics.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhum job nas últimas 24 horas</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo de Job</TableHead>
          <TableHead className="text-center">Total</TableHead>
          <TableHead className="text-center">Sucesso</TableHead>
          <TableHead className="text-center">Falha</TableHead>
          <TableHead className="text-center">Travados</TableHead>
          <TableHead>Taxa de Sucesso</TableHead>
          <TableHead className="text-right">Tempo Médio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((metric) => {
          const successRate = metric.success_rate_pct || 0;
          const isHealthy = successRate >= 90;
          const isWarning = successRate >= 70 && successRate < 90;
          const isCritical = successRate < 70;

          return (
            <TableRow key={metric.type}>
              <TableCell className="font-medium">
                {jobTypeLabels[metric.type] || metric.type}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline">{metric.total_jobs}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {metric.completed}
                </span>
              </TableCell>
              <TableCell className="text-center">
                {metric.failed > 0 ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {metric.failed}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {metric.stuck > 0 ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {metric.stuck}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 min-w-[120px]">
                  <Progress 
                    value={successRate} 
                    className={cn(
                      "h-2 flex-1",
                      isHealthy && "[&>div]:bg-green-500",
                      isWarning && "[&>div]:bg-yellow-500",
                      isCritical && "[&>div]:bg-red-500"
                    )}
                  />
                  <span className={cn(
                    "text-sm font-medium w-12 text-right",
                    isHealthy && "text-green-600 dark:text-green-400",
                    isWarning && "text-yellow-600 dark:text-yellow-400",
                    isCritical && "text-red-600 dark:text-red-400"
                  )}>
                    {successRate.toFixed(1)}%
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {metric.avg_execution_seconds 
                  ? `${metric.avg_execution_seconds.toFixed(1)}s`
                  : '-'
                }
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
