import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Gauge, 
  TrendingUp, 
  TrendingDown,
  Target,
  Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useJobsSLO, getBurnRateStatus } from '@/hooks/useJobsSLO';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';

export function JobSLOStatusCard() {
  const { 
    sloState, 
    burnRate, 
    errorRate, 
    status, 
    isLoading, 
    burnRateFormatted,
    errorRateFormatted,
    sloTarget,
    errorBudget,
    isBreached,
    isCritical,
    needsAttention
  } = useJobsSLO();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const successRate = sloState ? (1 - (sloState.error_rate || 0)) * 100 : 100;
  const errorBudgetUsed = burnRate * 10; // Simplified: burn rate of 10 = 100% budget

  return (
    <Card className={cn(
      "transition-all duration-300",
      isCritical && "border-red-500 dark:border-red-500",
      needsAttention && !isCritical && "border-yellow-500 dark:border-yellow-500"
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            SLO do Job Engine
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn(status.bgColor, status.textColor)}
          >
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          Target: {sloTarget} de sucesso • Budget de erro: {errorBudget}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Burn Rate Display */}
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            {burnRate < 1 ? (
              <TrendingDown className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingUp className={cn(
                "h-5 w-5",
                isCritical ? "text-red-500" : "text-yellow-500"
              )} />
            )}
            <span className={cn(
              "text-4xl font-bold tabular-nums",
              status.textColor
            )}>
              {burnRateFormatted}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Taxa de Queima do Error Budget
          </p>
        </motion.div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Success Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" />
                Taxa de Sucesso
              </span>
              <span className={cn(
                "font-medium",
                successRate >= 99.5 ? "text-green-600 dark:text-green-400" :
                successRate >= 99 ? "text-yellow-600 dark:text-yellow-400" :
                "text-red-600 dark:text-red-400"
              )}>
                {successRate.toFixed(2)}%
              </span>
            </div>
            <Progress 
              value={successRate} 
              className="h-2"
            />
          </div>

          {/* Error Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Taxa de Erro
              </span>
              <span className={cn(
                "font-medium",
                errorRate <= 0.005 ? "text-green-600 dark:text-green-400" :
                errorRate <= 0.01 ? "text-yellow-600 dark:text-yellow-400" :
                "text-red-600 dark:text-red-400"
              )}>
                {errorRateFormatted}
              </span>
            </div>
            <Progress 
              value={Math.min(errorRate * 100 * 10, 100)} // Scale for visibility
              className="h-2"
            />
          </div>
        </div>

        {/* Error Budget Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Consumo do Error Budget (janela 1h)
            </span>
            <span className={cn(
              "font-medium",
              errorBudgetUsed <= 50 ? "text-green-600 dark:text-green-400" :
              errorBudgetUsed <= 100 ? "text-yellow-600 dark:text-yellow-400" :
              "text-red-600 dark:text-red-400"
            )}>
              {Math.min(errorBudgetUsed, 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                errorBudgetUsed <= 50 ? "bg-green-500" :
                errorBudgetUsed <= 100 ? "bg-yellow-500" :
                "bg-red-500"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(errorBudgetUsed, 100)}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Status Info */}
        {sloState && (
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4">
            <span>
              Jobs avaliados: {sloState.total_jobs} ({sloState.error_jobs} erros)
            </span>
            <span>
              Atualizado {formatDistanceToNow(new Date(sloState.evaluated_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </span>
          </div>
        )}

        {/* Alert Banner */}
        {isBreached && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-3 rounded-lg text-sm",
              isCritical 
                ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
            )}
          >
            {isCritical 
              ? "⚠️ CRÍTICO: Error budget esgotado. Ação imediata necessária!"
              : "ℹ️ Error budget sendo consumido. Monitore a situação."
            }
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
