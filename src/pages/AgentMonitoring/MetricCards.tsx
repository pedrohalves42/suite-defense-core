import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardsProps {
  totalAgents: number;
  onlineAgents: number;
  offlineAgents: number;
  successRate: number;
}

export function MetricCards({ totalAgents, onlineAgents, offlineAgents, successRate }: MetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-gradient-card border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Base Monitorada</CardTitle>
          <Monitor className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalAgents}</div>
          <p className="text-xs text-muted-foreground">{onlineAgents} online, {offlineAgents} offline</p>
        </CardContent>
      </Card>

      <Card className={cn("bg-gradient-card", onlineAgents === totalAgents && totalAgents > 0 ? "border-green-500/30" : "border-primary/20")}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Computadores Online</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{onlineAgents}</div>
          <p className={cn("text-xs", onlineAgents === totalAgents && totalAgents > 0 ? "text-green-500" : "text-muted-foreground")}>
            {onlineAgents === totalAgents && totalAgents > 0 ? '✓ Todos conectados' : `${totalAgents > 0 ? Math.round((onlineAgents / totalAgents) * 100) : 0}% do total`}
          </p>
        </CardContent>
      </Card>

      <Card className={cn("bg-gradient-card", offlineAgents > 0 ? "border-red-500/30" : "border-green-500/30")}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Computadores Offline</CardTitle>
          <AlertTriangle className={cn("h-4 w-4", offlineAgents > 0 ? "text-red-500" : "text-green-500")} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", offlineAgents > 0 ? "text-red-500" : "text-green-500")}>{offlineAgents}</div>
          <p className={cn("text-xs", offlineAgents > 0 ? "text-red-400" : "text-green-500")}>
            {offlineAgents > 0 ? '⚠️ Requerem verificação' : '✓ Nenhum offline'}
          </p>
        </CardContent>
      </Card>

      <Card className={cn("bg-gradient-card", successRate >= 90 ? "border-green-500/30" : successRate >= 50 ? "border-yellow-500/30" : "border-red-500/30")}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
          <TrendingUp className={cn("h-4 w-4", successRate >= 90 ? "text-green-500" : successRate >= 50 ? "text-yellow-500" : "text-red-500")} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", successRate >= 90 ? "text-green-500" : successRate >= 50 ? "text-yellow-500" : "text-red-500")}>
            {successRate}%
          </div>
          <p className={cn("text-xs", successRate >= 90 ? "text-green-500" : successRate >= 50 ? "text-yellow-500" : "text-red-400")}>
            {successRate >= 90 ? '✓ Excelente performance' : successRate >= 50 ? '⚠️ Performance moderada' : '❌ Muitas falhas detectadas'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
