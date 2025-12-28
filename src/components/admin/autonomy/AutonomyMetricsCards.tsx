import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Zap, AlertTriangle, CheckCircle, Clock, Shield, TrendingUp, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface AutonomyMetrics {
  total_decisions: number;
  total_actions_created: number;
  actions_auto_executed: number;
  actions_pending: number;
  actions_approved: number;
  actions_rejected: number;
  alerts_generated: number;
  execution_success_rate: number;
  job_success_rate_corrected: number;
}

interface AutonomyMetricsCardsProps {
  metrics: AutonomyMetrics | null;
  isLoading: boolean;
  days: number;
}

export function AutonomyMetricsCards({ metrics, isLoading, days }: AutonomyMetricsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Decisões Tomadas',
      value: metrics?.total_decisions ?? 0,
      description: `Últimos ${days} dias`,
      icon: Brain,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Ações Criadas',
      value: metrics?.total_actions_created ?? 0,
      description: 'Total de ações geradas',
      icon: Zap,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      title: 'Auto-Executadas',
      value: metrics?.actions_auto_executed ?? 0,
      description: 'Ações executadas automaticamente',
      icon: Activity,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Pendentes',
      value: metrics?.actions_pending ?? 0,
      description: 'Aguardando aprovação',
      icon: Clock,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Aprovadas',
      value: metrics?.actions_approved ?? 0,
      description: 'Aprovadas manualmente',
      icon: CheckCircle,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Rejeitadas',
      value: metrics?.actions_rejected ?? 0,
      description: 'Rejeitadas pelo operador',
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Alertas IA',
      value: metrics?.alerts_generated ?? 0,
      description: 'Alertas gerados por IA',
      icon: Shield,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Taxa de Sucesso',
      value: `${metrics?.execution_success_rate ?? 0}%`,
      description: 'Execuções bem-sucedidas',
      icon: TrendingUp,
      color: metrics?.execution_success_rate && metrics.execution_success_rate >= 90 
        ? 'text-green-500' 
        : metrics?.execution_success_rate && metrics.execution_success_rate >= 70 
          ? 'text-amber-500' 
          : 'text-red-500',
      bgColor: metrics?.execution_success_rate && metrics.execution_success_rate >= 90 
        ? 'bg-green-500/10' 
        : metrics?.execution_success_rate && metrics.execution_success_rate >= 70 
          ? 'bg-amber-500/10' 
          : 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.color}`}>
              {card.value}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
