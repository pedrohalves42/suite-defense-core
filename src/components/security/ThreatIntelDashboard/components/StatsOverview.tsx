import { Card, CardContent } from '@/components/ui/card';
import { Target, AlertTriangle, Activity, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useThreatIntelStats } from '@/hooks/useThreatIntel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function StatsOverview() {
  const { data: stats, isLoading } = useThreatIntelStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Indicadores Ativos',
      value: stats?.total_indicators ?? 0,
      icon: <Target className="h-5 w-5 text-primary" />,
      color: 'text-primary',
    },
    {
      label: 'Matches Abertos',
      value: stats?.open_matches ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      color: 'text-destructive',
    },
    {
      label: 'Matches (24h)',
      value: stats?.total_matches_24h ?? 0,
      icon: <Activity className="h-5 w-5 text-orange-400" />,
      color: 'text-orange-400',
    },
    {
      label: 'Último Sync',
      value: stats?.last_sync?.completed_at
        ? formatDistanceToNow(new Date(stats.last_sync.completed_at), { addSuffix: true, locale: ptBR })
        : 'Nunca',
      icon: <Clock className="h-5 w-5 text-muted-foreground" />,
      color: 'text-muted-foreground',
      small: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color} ${card.small ? 'text-base' : ''}`}>
                    {card.value}
                  </p>
                </div>
                {card.icon}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
