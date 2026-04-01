import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Server, Activity, Clock, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { OperationsSummary, StuckJob } from './useSystemOperations';

interface SummaryCardsProps {
  summary: OperationsSummary | undefined;
  stuckJobs: StuckJob[];
  jobSuccessRate: number;
}

export function SummaryCards({ summary, stuckJobs, jobSuccessRate }: SummaryCardsProps) {
  const cards = [
    {
      icon: Server, title: 'Computadores', delay: 0,
      borderColor: summary?.offline_agents === 0 ? 'border-green-500' : 'border-yellow-500',
      value: `${summary?.online_agents || 0}/${summary?.total_agents || 0}`,
      sub: `${summary?.offline_agents || 0} offline`,
    },
    {
      icon: Activity, title: 'Taxa de Sucesso (24h)', delay: 0.1,
      borderColor: jobSuccessRate >= 90 ? 'border-green-500' : jobSuccessRate >= 70 ? 'border-yellow-500' : 'border-red-500',
      value: `${jobSuccessRate}%`,
      sub: `${summary?.jobs_completed_24h || 0} de ${summary?.jobs_24h || 0} jobs`,
    },
    {
      icon: Clock, title: 'Jobs Travados', delay: 0.2,
      borderColor: stuckJobs.length === 0 ? 'border-green-500' : 'border-red-500',
      value: String(stuckJobs.length),
      sub: stuckJobs.length > 0 ? `Mais antigo: ${Math.round(stuckJobs[0]?.minutes_stuck || 0)} min` : 'Nenhum travado',
    },
    {
      icon: AlertTriangle, title: 'Alertas Ativos', delay: 0.3,
      borderColor: (summary?.open_alerts || 0) === 0 ? 'border-green-500' : 'border-orange-500',
      value: String(summary?.open_alerts || 0),
      sub: 'Alertas em aberto',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: card.delay }}>
            <Card className={cn("border-l-4", card.borderColor)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon className="h-4 w-4" />{card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
