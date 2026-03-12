import { Users, Network, AlertCircle, TrendingUp, ArrowRight } from "lucide-react";
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
}

export function MetricCards({
  totalAgents, onlinePercentage, offlineCount,
  alerts, successRate, failedJobs,
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
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card 
            key={card.title}
            className={cn("bg-gradient-card cursor-pointer hover:border-primary/40 transition-all group", card.borderClass)}
            onClick={() => navigate(card.route)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  {card.title}
                </span>
                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold text-foreground", card.valueClass)}>
                {card.value}
              </div>
              <p className={cn("text-xs mt-1", card.subtitleClass)}>
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
