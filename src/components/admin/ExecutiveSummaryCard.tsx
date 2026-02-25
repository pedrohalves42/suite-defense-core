/**
 * Executive Summary Card - Clean, data-driven protection overview
 */

import { useTodayRiskDelta, useGenerateExecutiveReport, getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, DollarSign, RefreshCw, 
  Monitor, MonitorOff, ShieldCheck, TrendingDown, TrendingUp, Minus
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

function useFleetStatus() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['fleet-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const cutoff = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 1.5h

      const { data: agents } = await supabase
        .from('agents')
        .select('status, last_heartbeat')
        .eq('tenant_id', tenant.id);

      if (!agents) return { online: 0, offline: 0, total: 0 };

      const online = agents.filter(a => a.last_heartbeat && a.last_heartbeat > cutoff).length;
      const total = agents.length;

      return { online, offline: total - online, total };
    },
    enabled: !!tenant?.id,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function ExecutiveSummaryCard() {
  const { data: riskDelta, isLoading } = useTodayRiskDelta();
  const { data: fleet, isLoading: fleetLoading } = useFleetStatus();
  const generateReport = useGenerateExecutiveReport();

  if (isLoading || fleetLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-52" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-14" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const deltaInfo = getDeltaInfo(riskDelta?.delta ?? null);
  const DeltaIcon = deltaInfo.icon === 'down' ? TrendingDown : 
                    deltaInfo.icon === 'up' ? TrendingUp : Minus;

  const costAvoided = riskDelta?.estimated_cost_avoided ?? 0;
  const threatsBlocked = riskDelta?.threats_blocked ?? 0;
  const incidentsPrevented = riskDelta?.incidents_prevented ?? 0;

  // Simple, human narrative
  const buildNarrative = () => {
    const parts: string[] = [];

    if (fleet && fleet.online > 0) {
      parts.push(`${fleet.online} de ${fleet.total} máquinas online agora`);
      if (fleet.offline > 0) {
        parts.push(`${fleet.offline} offline (fora do expediente)`);
      }
    }

    if (incidentsPrevented > 0) {
      parts.push(`${incidentsPrevented} incidente${incidentsPrevented > 1 ? 's' : ''} neutralizado${incidentsPrevented > 1 ? 's' : ''} hoje`);
    }

    if (costAvoided > 0) {
      parts.push(`${formatCurrency(costAvoided)} em prejuízos evitados`);
    }

    if (parts.length === 0) {
      if (fleet && fleet.total > 0) {
        return `Monitorando ${fleet.total} dispositivos. Sem incidentes hoje — ambiente seguro.`;
      }
      return 'Configure agentes para iniciar a proteção.';
    }

    return parts.join('. ') + '.';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-sm font-semibold">Resumo Executivo</CardTitle>
                <CardDescription className="text-xs">Visão de alto nível para gestores</CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => generateReport.mutate(new Date().toISOString().split('T')[0])}
              disabled={generateReport.isPending}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", generateReport.isPending && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Narrative */}
          <p className="text-sm text-muted-foreground leading-relaxed px-0.5">
            {riskDelta?.executive_summary && riskDelta.executive_summary !== 'Prezados, hoje não houve registro'
              ? riskDelta.executive_summary
              : buildNarrative()}
          </p>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Risk Delta */}
            <MetricCard
              icon={<DeltaIcon className="h-4 w-4" />}
              label="Delta de Risco"
              value={deltaInfo.label}
              detail={deltaInfo.description}
              variant={deltaInfo.color === 'green' ? 'positive' : deltaInfo.color === 'red' ? 'negative' : 'neutral'}
            />

            {/* Fleet Online */}
            <MetricCard
              icon={<Monitor className="h-4 w-4" />}
              label="Online Agora"
              value={`${fleet?.online ?? 0}`}
              detail={fleet?.total ? `de ${fleet.total} dispositivos` : 'Sem agentes'}
              variant={fleet?.online && fleet.online > 0 ? 'positive' : 'neutral'}
            />

            {/* Fleet Offline */}
            <MetricCard
              icon={<MonitorOff className="h-4 w-4" />}
              label="Offline"
              value={`${fleet?.offline ?? 0}`}
              detail="Fora do expediente"
              variant="neutral"
            />

            {/* Cost Avoided */}
            <MetricCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Custo Evitado"
              value={formatCurrency(costAvoided)}
              detail={costAvoided > 0 ? 'Em incidentes prevenidos' : 'Proteção contínua'}
              variant={costAvoided > 0 ? 'highlight' : 'neutral'}
            />
          </div>

          {/* Key Events */}
          {riskDelta?.key_events && riskDelta.key_events.length > 0 && (
            <div className="pt-3 border-t border-border/40">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">Eventos do dia</p>
              <div className="space-y-1">
                {riskDelta.key_events.slice(0, 3).map((event, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                      event.severity === 'critical' && "bg-red-500",
                      event.severity === 'high' && "bg-orange-500",
                      event.severity === 'medium' && "bg-yellow-500",
                      (!event.severity || event.severity === 'low') && "bg-muted-foreground/40"
                    )} />
                    <span className="truncate">{event.description}</span>
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

function MetricCard({ icon, label, value, detail, variant }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  variant: 'positive' | 'negative' | 'neutral' | 'highlight';
}) {
  const styles = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    highlight: 'text-emerald-600',
    neutral: 'text-foreground',
  };

  return (
    <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={cn("text-lg font-semibold leading-tight", styles[variant])}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>
    </div>
  );
}
