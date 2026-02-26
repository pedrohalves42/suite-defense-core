/**
 * Executive Summary Card - Polished, data-driven protection overview
 */

import { useTodayRiskDelta, useGenerateExecutiveReport, getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';
import { useAgentSnapshots, getAgentStatusCounts } from '@/hooks/useAgentSnapshots';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, RefreshCw, 
  Monitor, MonitorOff, ShieldCheck, TrendingDown, TrendingUp, Minus, Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function ExecutiveSummaryCard() {
  const { data: riskDelta, isLoading } = useTodayRiskDelta();
  const { data: snapshots, isLoading: fleetLoading } = useAgentSnapshots();
  const fleet = (() => {
    const counts = getAgentStatusCounts(snapshots);
    return counts.total > 0 ? { online: counts.online, offline: counts.offline + counts.warning + counts.never_connected, total: counts.total } : null;
  })();
  const generateReport = useGenerateExecutiveReport();

  if (isLoading || fleetLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="p-5 space-y-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-16" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[88px]" />)}
          </div>
        </div>
      </Card>
    );
  }

  const deltaInfo = getDeltaInfo(riskDelta?.delta ?? null);
  const DeltaIcon = deltaInfo.icon === 'down' ? TrendingDown : 
                    deltaInfo.icon === 'up' ? TrendingUp : Minus;

  const costAvoided = riskDelta?.estimated_cost_avoided ?? 0;
  const incidentsPrevented = riskDelta?.incidents_prevented ?? 0;
  const hasOnline = fleet && fleet.online > 0;

  const buildNarrative = () => {
    if (riskDelta?.executive_summary && 
        riskDelta.executive_summary !== 'Prezados, hoje não houve registro') {
      return riskDelta.executive_summary;
    }

    const parts: string[] = [];

    if (fleet && fleet.total > 0) {
      if (fleet.online > 0) {
        parts.push(`${fleet.online} de ${fleet.total} endpoints reportando em tempo real`);
      }
      if (fleet.offline > 0) {
        parts.push(`${fleet.offline} fora do horário de expediente`);
      }
    }

    if (incidentsPrevented > 0) {
      parts.push(`${incidentsPrevented} incidente${incidentsPrevented > 1 ? 's' : ''} neutralizado${incidentsPrevented > 1 ? 's' : ''}`);
    }

    if (parts.length === 0) {
      return fleet && fleet.total > 0
        ? `Ambiente protegido — ${fleet.total} dispositivos monitorados, sem incidentes registrados hoje.`
        : 'Nenhum dispositivo configurado ainda.';
    }

    return parts.join(' · ') + '.';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Resumo Executivo</h3>
              <p className="text-[11px] text-muted-foreground">Proteção do ambiente</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasOnline && (
              <Badge variant="outline" className="gap-1.5 text-[10px] font-medium h-6 border-green-500/30 text-green-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                Monitorando
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => generateReport.mutate(new Date().toISOString().split('T')[0])}
              disabled={generateReport.isPending}
              title="Atualizar relatório"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", generateReport.isPending && "animate-spin")} />
            </Button>
          </div>
        </div>

        <CardContent className="px-5 pb-5 space-y-4">
          {/* Narrative */}
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {buildNarrative()}
          </p>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <MetricTile
              icon={<DeltaIcon className="h-3.5 w-3.5" />}
              label="Delta de Risco"
              value={deltaInfo.label}
              sub={deltaInfo.description}
              color={deltaInfo.color === 'green' ? 'green' : deltaInfo.color === 'red' ? 'red' : 'muted'}
            />

            <MetricTile
              icon={<Monitor className="h-3.5 w-3.5" />}
              label="Online"
              value={`${fleet?.online ?? 0}`}
              sub={fleet?.total ? `de ${fleet.total} endpoints` : '—'}
              color={hasOnline ? 'green' : 'muted'}
              pulse={hasOnline}
            />

            <MetricTile
              icon={<MonitorOff className="h-3.5 w-3.5" />}
              label="Offline"
              value={`${fleet?.offline ?? 0}`}
              sub="Fora do expediente"
              color="muted"
            />

            <MetricTile
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="Custo Evitado"
              value={formatCurrency(costAvoided)}
              sub={costAvoided > 0 ? 'Incidentes prevenidos' : 'Sem incidentes'}
              color={costAvoided > 0 ? 'emerald' : 'muted'}
            />
          </div>

          {/* Key Events */}
          {riskDelta?.key_events && riskDelta.key_events.length > 0 && (
            <div className="pt-3 border-t border-border/30">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">Atividade recente</span>
              </div>
              <div className="space-y-1.5">
                {riskDelta.key_events.slice(0, 3).map((event, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <span className={cn(
                      "mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0",
                      event.severity === 'critical' && "bg-red-500",
                      event.severity === 'high' && "bg-orange-500",
                      event.severity === 'medium' && "bg-yellow-500",
                      (!event.severity || event.severity === 'low') && "bg-muted-foreground/30"
                    )} />
                    <span className="text-muted-foreground leading-snug">{event.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Metric Tile ──────────────────────────────────────── */

function MetricTile({ icon, label, value, sub, color, pulse }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'green' | 'red' | 'emerald' | 'muted';
  pulse?: boolean;
}) {
  const valueColor = {
    green: 'text-green-500',
    red: 'text-red-500',
    emerald: 'text-emerald-500',
    muted: 'text-foreground',
  }[color];

  const bgAccent = {
    green: 'bg-green-500/5 border-green-500/15',
    red: 'bg-red-500/5 border-red-500/15',
    emerald: 'bg-emerald-500/5 border-emerald-500/15',
    muted: 'bg-muted/30 border-border/40',
  }[color];

  return (
    <div className={cn(
      "relative p-3 rounded-xl border transition-colors",
      bgAccent
    )}>
      {pulse && (
        <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={cn("text-xl font-bold leading-none tracking-tight", valueColor)}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground/70 mt-1">{sub}</p>
    </div>
  );
}
