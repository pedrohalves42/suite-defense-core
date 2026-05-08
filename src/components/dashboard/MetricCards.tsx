import { memo } from "react";
import { Users, Network, AlertCircle, TrendingUp, TrendingDown, ArrowRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface MetricCardsProps {
  totalAgents: number;
  onlinePercentage: string;
  offlineCount: number;
  alerts: number;
  successRate: string;
  failedJobs: number;
  trends?: {
    failedTrend: number;
    successRateTrend: number;
    totalJobsTrend: number;
  };
}

function TrendIndicator({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const { t } = useTranslation();
  
  if (value === 0) return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Minus className="h-2.5 w-2.5" /> {t('dashboard.metrics.stable', 'estável')}
    </span>
  );
  
  const isPositive = inverted ? value < 0 : value > 0;
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  
  return (
    <span className={cn(
      "flex items-center gap-0.5 text-[10px] font-medium",
      isPositive ? "text-success" : "text-destructive"
    )}>
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(value)}{typeof value === 'number' && !Number.isInteger(value) ? '%' : ''} vs 24h
    </span>
  );
}

function MetricCardsComponent({
  totalAgents, onlinePercentage, offlineCount,
  alerts, successRate, failedJobs, trends,
}: MetricCardsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const cards = [
    {
      title: t('dashboard.metrics.activeProtection', 'Proteção Ativa'),
      icon: Users,
      value: t('dashboard.metrics.computersCount', { count: totalAgents, defaultValue: `${totalAgents} computadores` }),
      subtitle: t('dashboard.metrics.monitoredRealtime', '✓ Monitorados em tempo real'),
      subtitleClass: "text-success",
      borderClass: "border-primary/20",
      route: '/admin/agent-health',
      trend: trends ? <TrendIndicator value={trends.totalJobsTrend} /> : null,
    },
    {
      title: t('dashboard.metrics.connection', 'Conexão'),
      icon: Network,
      value: t('dashboard.metrics.onlinePercent', { percent: onlinePercentage, defaultValue: `${onlinePercentage}% online` }),
      subtitle: offlineCount > 0 
        ? t('dashboard.metrics.needsAttention', { count: offlineCount, defaultValue: `${offlineCount} precisam de atenção` })
        : t('dashboard.metrics.allConnected', '✓ Todos conectados'),
      subtitleClass: offlineCount > 0 ? "text-warning" : "text-success",
      borderClass: offlineCount > 0 ? "border-warning/30" : "border-success/20",
      route: '/admin/agent-health',
      trend: null,
    },
    {
      title: t('dashboard.metrics.alerts', 'Alertas'),
      icon: AlertCircle,
      value: alerts > 0 ? t('dashboard.metrics.activeAlerts', { count: alerts, defaultValue: `${alerts} ativos` }) : t('dashboard.metrics.none', 'Nenhum'),
      valueClass: alerts > 0 ? "text-destructive" : "text-success",
      subtitle: alerts > 0 ? t('dashboard.metrics.requiresVerification', 'Requer verificação') : t('dashboard.metrics.noPendingActions', '✓ Sem ações pendentes'),
      subtitleClass: "text-muted-foreground",
      borderClass: alerts > 0 ? "border-destructive/30" : "border-success/20",
      route: '/admin/security-monitoring',
      trend: trends ? <TrendIndicator value={trends.failedTrend} inverted /> : null,
    },
    {
      title: t('dashboard.metrics.verifications', 'Verificações'),
      icon: TrendingUp,
      value: t('dashboard.metrics.successRate', { rate: successRate, defaultValue: `${successRate}% sucesso` }),
      subtitle: failedJobs > 0 
        ? t('dashboard.metrics.failures24h', { count: failedJobs, defaultValue: `${failedJobs} falhas nas 24h` })
        : t('dashboard.metrics.everythingWorking', '✓ Tudo funcionando'),
      subtitleClass: failedJobs > 0 ? "text-warning" : "text-success",
      borderClass: failedJobs > 0 ? "border-warning/30" : "border-success/20",
      route: '/admin/job-health',
      trend: trends ? <TrendIndicator value={trends.successRateTrend} /> : null,
    },
  ];

  return (
    <div 
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" 
      role="region" 
      aria-label="Métricas principais do sistema"
    >
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card 
            key={card.title}
            className={cn(
              "relative overflow-hidden transition-all duration-700 shadow-premium group focus-ring cursor-pointer glass-card border-white/5 hover:-translate-y-2 hover:border-cta-positive/30",
              card.borderClass
            )}
            onClick={() => navigate(card.route)}
            role="link"
            tabIndex={0}
            aria-label={`${card.title}: ${card.value}. ${card.subtitle}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(card.route); } }}
          >
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
            
            <CardHeader className="pb-2 relative px-4 sm:px-6 pt-4 sm:pt-6">
              <CardTitle className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center justify-between text-muted-foreground/80 gap-2">
                <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <div className="p-1 sm:p-1.5 rounded-lg bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 flex-shrink-0">
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                  </div>
                  <span className="truncate">{card.title}</span>
                </span>
                <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary flex-shrink-0" aria-hidden="true" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative px-4 sm:px-6 pb-4 sm:pb-6">
              <div className={cn("text-xl sm:text-2xl font-black tracking-tight transition-colors duration-300 break-words", card.valueClass || "text-foreground")}>
                {card.value}
              </div>
              <p className={cn("text-[11px] sm:text-xs font-semibold mt-1 flex items-center gap-1.5", card.subtitleClass)}>
                <span className="truncate">{card.subtitle}</span>
              </p>
              {card.trend && <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-border/40">{card.trend}</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export const MetricCards = memo(MetricCardsComponent);