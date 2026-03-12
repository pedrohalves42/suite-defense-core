import { memo } from "react";
import { Users, Network, AlertCircle, TrendingUp, TrendingDown, ArrowRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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
  if (value === 0) return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Minus className="h-2.5 w-2.5" /> estável
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

  const cards = [
    {
      title: "Proteção Ativa",
      icon: Users,
      value: `${totalAgents} computador${totalAgents !== 1 ? 'es' : ''}`,
      subtitle: "✓ Monitorados em tempo real",
      subtitleClass: "text-success",
      borderClass: "border-primary/20",
      route: '/admin/agent-health',
      trend: trends ? <TrendIndicator value={trends.totalJobsTrend} /> : null,
    },
    {
      title: "Conexão",
      icon: Network,
      value: `${onlinePercentage}% online`,
      subtitle: offlineCount > 0 
        ? `${offlineCount} precisa${offlineCount !== 1 ? 'm' : ''} de atenção`
        : '✓ Todos conectados',
      subtitleClass: offlineCount > 0 ? "text-warning" : "text-success",
      borderClass: offlineCount > 0 ? "border-warning/30" : "border-success/20",
      route: '/admin/agent-health',
      trend: null,
    },
    {
      title: "Alertas",
      icon: AlertCircle,
      value: alerts > 0 ? `${alerts} ativo${alerts !== 1 ? 's' : ''}` : 'Nenhum',
      valueClass: alerts > 0 ? "text-destructive" : "text-success",
      subtitle: alerts > 0 ? 'Requer verificação' : '✓ Sem ações pendentes',
      subtitleClass: "text-muted-foreground",
      borderClass: alerts > 0 ? "border-destructive/30" : "border-success/20",
      route: '/admin/security-monitoring',
      trend: trends ? <TrendIndicator value={trends.failedTrend} inverted /> : null,
    },
    {
      title: "Verificações",
      icon: TrendingUp,
      value: `${successRate}% sucesso`,
      subtitle: failedJobs > 0 
        ? `${failedJobs} falha${failedJobs !== 1 ? 's' : ''} nas 24h`
        : '✓ Tudo funcionando',
      subtitleClass: failedJobs > 0 ? "text-warning" : "text-success",
      borderClass: failedJobs > 0 ? "border-warning/30" : "border-success/20",
      route: '/admin/job-health',
      trend: trends ? <TrendIndicator value={trends.successRateTrend} /> : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4" role="region" aria-label="Métricas principais do sistema">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card 
            key={card.title}
            className={cn("bg-gradient-card cursor-pointer hover:border-primary/40 transition-all group", card.borderClass)}
            onClick={() => navigate(card.route)}
            role="button"
            tabIndex={0}
            aria-label={`${card.title}: ${card.value}. ${card.subtitle}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(card.route); } }}
          >
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-xs font-medium flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  <span className="hidden sm:inline">{card.title}</span>
                </span>
                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className={cn("text-lg sm:text-2xl font-bold text-foreground", card.valueClass)}>
                {card.value}
              </div>
              <p className={cn("text-[10px] sm:text-xs mt-0.5", card.subtitleClass)}>
                {card.subtitle}
              </p>
              {card.trend && <div className="mt-1">{card.trend}</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export const MetricCards = memo(MetricCardsComponent);
