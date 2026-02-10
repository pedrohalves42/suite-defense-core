import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useJobAnomalies, 
  getAnomalySeverity, 
  getAnomalySeverityConfig 
} from '@/hooks/useJobAnomalies';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';

interface JobAnomaliesCardProps {
  onNavigateToCleanup?: () => void;
}

export function JobAnomaliesCard({ onNavigateToCleanup }: JobAnomaliesCardProps) {
  const { summary, anomalies, isLoading, refetch, isRefetching } = useJobAnomalies();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { hasAnomalies, isCritical, totalAnomalies, oldestAnomaly } = summary;

  return (
    <Card className={cn(
      "transition-all duration-300",
      hasAnomalies && isCritical && "border-red-500 dark:border-red-500",
      hasAnomalies && !isCritical && "border-yellow-500 dark:border-yellow-500"
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {hasAnomalies ? (
              <>
                <ShieldAlert className={cn(
                  "h-5 w-5",
                  isCritical ? "text-red-500" : "text-yellow-500"
                )} />
                <span>Estado do Job Engine</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-5 w-5 text-green-500" />
                <span>Estado do Job Engine</span>
              </>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
          </Button>
        </div>
        <CardDescription>
          {hasAnomalies 
            ? `${totalAnomalies} anomalia(s) detectada(s) - requer atenção`
            : 'Todos os invariantes estão válidos'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {!hasAnomalies ? (
            <motion.div
              key="healthy"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-4 p-4 bg-green-500/10 rounded-lg border border-green-500/20"
            >
              <div className="p-3 bg-green-500/20 rounded-full">
                <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-green-600 dark:text-green-400">
                  Sistema Saudável
                </p>
                <p className="text-sm text-muted-foreground">
                  Nenhuma anomalia detectada. Todos os jobs estão em estados válidos.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="anomalies"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Summary */}
              <div className={cn(
                "flex items-center gap-4 p-4 rounded-lg border",
                isCritical 
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-yellow-500/10 border-yellow-500/20"
              )}>
                <div className={cn(
                  "p-3 rounded-full",
                  isCritical ? "bg-red-500/20" : "bg-yellow-500/20"
                )}>
                  <AlertTriangle className={cn(
                    "h-6 w-6",
                    isCritical 
                      ? "text-red-600 dark:text-red-400"
                      : "text-yellow-600 dark:text-yellow-400"
                  )} />
                </div>
                <div className="flex-1">
                  <p className={cn(
                    "font-semibold",
                    isCritical 
                      ? "text-red-600 dark:text-red-400"
                      : "text-yellow-600 dark:text-yellow-400"
                  )}>
                    {isCritical ? 'Atenção Crítica Necessária' : 'Atenção Necessária'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {totalAnomalies} anomalia(s) requerem resolução
                    {oldestAnomaly && (
                      <span className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Mais antiga: {formatDistanceToNow(oldestAnomaly, { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </span>
                    )}
                  </p>
                </div>
                {onNavigateToCleanup && (
                  <Button 
                    variant={isCritical ? "destructive" : "outline"}
                    size="sm"
                    onClick={onNavigateToCleanup}
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Corrigir
                  </Button>
                )}
              </div>

              {/* Anomaly List */}
              <div className="space-y-2">
                {anomalies.map((anomaly) => {
                  const severity = getAnomalySeverity(anomaly.anomaly_type);
                  const config = getAnomalySeverityConfig(severity);
                  
                  return (
                    <div 
                      key={anomaly.anomaly_type}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        config.bgColor,
                        `border-${config.color}-500/20`
                      )}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", config.textColor)}
                          >
                            {config.label}
                          </Badge>
                          <span className="text-sm font-medium">
                            {anomaly.anomaly_type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {anomaly.description}
                        </p>
                      </div>
                      <div className={cn(
                        "text-2xl font-bold tabular-nums",
                        config.textColor
                      )}>
                        {anomaly.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
