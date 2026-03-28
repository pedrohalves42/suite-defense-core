import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, WifiOff, Key, XCircle, Computer } from 'lucide-react';
import type { ProblemCounts } from './types';

interface SummaryCardsProps {
  problemCounts: ProblemCounts;
  totalAgents: number;
}

export function SummaryCards({ problemCounts, totalAgents }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className={problemCounts.total > 0 ? 'border-destructive/30' : ''}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Com Problema</CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{problemCounts.total}</div>
          <p className="text-xs text-muted-foreground">Precisam de atenção</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Desconectados</CardTitle>
          <WifiOff className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{problemCounts.noHeartbeat}</div>
          <p className="text-xs text-muted-foreground">Sem sinal de vida</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credenciais</CardTitle>
          <Key className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{problemCounts.noToken}</div>
          <p className="text-xs text-muted-foreground">Precisam reinstalar</p>
        </CardContent>
      </Card>

      <Card className={problemCounts.failedJobs > 0 ? 'border-amber-500/30' : ''}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Jobs Falhados</CardTitle>
          <XCircle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{problemCounts.failedJobs}</div>
          <p className="text-xs text-muted-foreground">Últimas 24h</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total</CardTitle>
          <Computer className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalAgents}</div>
          <p className="text-xs text-muted-foreground">Computadores</p>
        </CardContent>
      </Card>
    </div>
  );
}
