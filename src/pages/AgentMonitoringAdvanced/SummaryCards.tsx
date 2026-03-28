import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu, HardDrive, MemoryStick, Monitor, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardSummary } from './types';
import { getHealthColor, getHealthBg } from './utils';

interface SummaryCardsProps {
  summary: DashboardSummary | null;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Computadores</CardTitle>
          <Monitor className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{summary?.total_agents || 0}</div>
          <div className="flex gap-3 mt-2 text-sm">
            <span className="flex items-center gap-1 text-success">
              <Wifi className="h-3 w-3" /> {summary?.online_agents || 0} online
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <WifiOff className="h-3 w-3" /> {summary?.offline_agents || 0} offline
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_cpu_usage || '0'), 90))}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Processador (Média)</CardTitle>
          <Cpu className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_cpu_usage || '0'), 90))} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_cpu_usage || '0'), 90))}>
            {summary?.avg_cpu_usage ? `${summary.avg_cpu_usage}%` : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {parseFloat(summary?.avg_cpu_usage || '0') > 90 ? '⚠️ Uso elevado' : '✓ Normal'}
          </p>
        </CardContent>
      </Card>

      <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_memory_usage || '0'), 85))}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Memória RAM (Média)</CardTitle>
          <MemoryStick className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_memory_usage || '0'), 85))} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_memory_usage || '0'), 85))}>
            {summary?.avg_memory_usage ? `${summary.avg_memory_usage}%` : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {parseFloat(summary?.avg_memory_usage || '0') > 85 ? '⚠️ Uso elevado' : '✓ Normal'}
          </p>
        </CardContent>
      </Card>

      <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_disk_usage || '0'), 90))}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Armazenamento (Média)</CardTitle>
          <HardDrive className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_disk_usage || '0'), 90))} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_disk_usage || '0'), 90))}>
            {summary?.avg_disk_usage ? `${summary.avg_disk_usage}%` : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {parseFloat(summary?.avg_disk_usage || '0') > 90 ? '⚠️ Disco cheio' : '✓ Normal'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
