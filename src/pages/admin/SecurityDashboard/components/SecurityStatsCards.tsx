import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, Activity, Ban } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { motion } from 'framer-motion';
import type { SecurityStats } from '../useSecurityDashboard';

interface SecurityStatsCardsProps {
  stats: SecurityStats | undefined;
}

const cards = [
  { key: 'total' as const, label: 'Total de Eventos', icon: Activity, color: 'border-l-blue-500', iconColor: 'text-blue-500', help: 'evento de segurança' },
  { key: 'critical' as const, label: 'Ataques Críticos', icon: AlertTriangle, color: 'border-l-destructive', iconColor: 'text-destructive', textColor: 'text-destructive' },
  { key: 'blocked' as const, label: 'Bloqueados', icon: Ban, color: 'border-l-green-500', iconColor: 'text-green-600', textColor: 'text-green-600', subtitle: 'tentativas impedidas' },
  { key: 'uniqueIps' as const, label: 'IPs Únicos', icon: Shield, color: 'border-l-purple-500', iconColor: 'text-purple-500', subtitle: 'origens diferentes' },
];

const subtitles: Record<string, string> = {
  total: 'nas últimas 24 horas',
  critical: 'requerem atenção imediata',
  blocked: 'tentativas impedidas',
  uniqueIps: 'origens diferentes',
};

export function SecurityStatsCards({ stats }: SecurityStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div key={card.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className={`border-l-4 ${card.color} hover:shadow-md transition-shadow`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  {card.label}
                  {card.help && <HelpTooltip term={card.help} />}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.textColor || ''}`}>{stats?.[card.key] || 0}</div>
                <p className="text-xs text-muted-foreground">{subtitles[card.key]}</p>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
