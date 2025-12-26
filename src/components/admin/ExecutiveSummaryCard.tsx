/**
 * Executive Summary Card - Risk Delta & AI Narrative
 * Fase 2: Dashboard Widget for Executive Overview
 */

import { useTodayRiskDelta, useGenerateExecutiveReport, getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, Shield, DollarSign, RefreshCw, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function ExecutiveSummaryCard() {
  const { data: riskDelta, isLoading, error } = useTodayRiskDelta();
  const generateReport = useGenerateExecutiveReport();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No data yet - show generate button
  if (!riskDelta) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Relatório Executivo</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Gere um resumo executivo com delta de risco, ameaças bloqueadas e custo evitado estimado.
          </p>
          <Button 
            onClick={() => generateReport.mutate(new Date().toISOString().split('T')[0])}
            disabled={generateReport.isPending}
          >
            {generateReport.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4 mr-2" />
                Gerar Relatório do Dia
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const deltaInfo = getDeltaInfo(riskDelta.delta);
  const DeltaIcon = deltaInfo.icon === 'up' ? TrendingUp : 
                    deltaInfo.icon === 'down' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Resumo Executivo
              </CardTitle>
              <CardDescription className="text-xs">
                Visão de alto nível para gestores
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => generateReport.mutate(new Date().toISOString().split('T')[0])}
              disabled={generateReport.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", generateReport.isPending && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Executive Narrative */}
          {riskDelta.executive_summary && (
            <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border/50">
              <p className="text-sm text-foreground leading-relaxed">
                {riskDelta.executive_summary}
              </p>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Risk Delta */}
            <div className={cn(
              "p-4 rounded-lg border",
              deltaInfo.color === 'green' && "bg-green-500/5 border-green-500/20",
              deltaInfo.color === 'red' && "bg-red-500/5 border-red-500/20",
              deltaInfo.color === 'neutral' && "bg-muted/30 border-border/50"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <DeltaIcon className={cn(
                  "h-5 w-5",
                  deltaInfo.color === 'green' && "text-green-600",
                  deltaInfo.color === 'red' && "text-red-600",
                  deltaInfo.color === 'neutral' && "text-muted-foreground"
                )} />
                <span className="text-xs text-muted-foreground">Delta de Risco</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  "text-2xl font-bold",
                  deltaInfo.color === 'green' && "text-green-600",
                  deltaInfo.color === 'red' && "text-red-600",
                  deltaInfo.color === 'neutral' && "text-foreground"
                )}>
                  {riskDelta.delta !== null ? (
                    riskDelta.delta > 0 ? `+${riskDelta.delta}` : riskDelta.delta
                  ) : '—'}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {deltaInfo.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {deltaInfo.description}
              </p>
            </div>

            {/* Threats Blocked */}
            <div className="p-4 rounded-lg border bg-orange-500/5 border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <span className="text-xs text-muted-foreground">Ameaças Bloqueadas</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-orange-600">
                  {riskDelta.threats_blocked ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">hoje</span>
              </div>
              {riskDelta.key_events && riskDelta.key_events.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {riskDelta.key_events[0].description}
                </p>
              )}
            </div>

            {/* Cost Avoided */}
            <div className="p-4 rounded-lg border bg-blue-500/5 border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
                <span className="text-xs text-muted-foreground">Custo Evitado</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-blue-600">
                  {formatCurrency(riskDelta.estimated_cost_avoided)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Estimativa baseada em incidentes evitados
              </p>
            </div>
          </div>

          {/* Key Events */}
          {riskDelta.key_events && riskDelta.key_events.length > 1 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground mb-2">Eventos Principais</p>
              <ul className="space-y-1">
                {riskDelta.key_events.slice(0, 3).map((event, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {event.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
