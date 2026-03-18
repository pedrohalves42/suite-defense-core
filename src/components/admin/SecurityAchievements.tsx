import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Trophy, Shield, Server, Bell, Eye, FileCheck,
  Brain, Lock, Zap, Star
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useUnifiedMetrics } from '@/hooks/useUnifiedMetrics';
import type { LucideIcon } from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  unlocked: boolean;
  progress: number; // 0-100
  category: 'bronze' | 'silver' | 'gold';
}

const CATEGORY_STYLES = {
  bronze: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/20', label: '🥉 Bronze' },
  silver: { bg: 'bg-slate-400/10', text: 'text-slate-400', border: 'border-slate-400/20', label: '🥈 Prata' },
  gold: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20', label: '🏆 Ouro' },
};

export function SecurityAchievements() {
  const { metrics } = useUnifiedMetrics();

  const achievements = useMemo<Achievement[]>(() => {
    const total = metrics?.agents.total || 0;
    const online = metrics?.agents.online || 0;
    const critAlerts = metrics?.alerts.critical || 0;
    const activeAlerts = metrics?.alerts.active || 0;
    const score = metrics?.securityScore || 0;
    const vulns = metrics?.vulnerabilities?.critical || 0;

    return [
      {
        id: 'first-agent',
        title: 'Primeiro Passo',
        description: 'Cadastre seu primeiro computador no sistema.',
        icon: Server,
        unlocked: total > 0,
        progress: total > 0 ? 100 : 0,
        category: 'bronze',
      },
      {
        id: 'all-online',
        title: 'Frota Completa',
        description: 'Mantenha todos os computadores online.',
        icon: Zap,
        unlocked: total > 0 && online === total,
        progress: total > 0 ? Math.round((online / total) * 100) : 0,
        category: 'silver',
      },
      {
        id: 'zero-critical',
        title: 'Zero Críticos',
        description: 'Resolva todos os alertas críticos.',
        icon: Shield,
        unlocked: critAlerts === 0,
        progress: critAlerts === 0 ? 100 : Math.max(0, 100 - critAlerts * 20),
        category: 'gold',
      },
      {
        id: 'inbox-zero',
        title: 'Inbox Zero',
        description: 'Resolva ou reconheça todos os alertas pendentes.',
        icon: Eye,
        unlocked: activeAlerts === 0,
        progress: activeAlerts === 0 ? 100 : Math.max(0, 100 - activeAlerts * 10),
        category: 'silver',
      },
      {
        id: 'no-vulns',
        title: 'Blindagem Total',
        description: 'Elimine todas as vulnerabilidades críticas.',
        icon: Lock,
        unlocked: vulns === 0,
        progress: vulns === 0 ? 100 : Math.max(0, 100 - vulns * 15),
        category: 'gold',
      },
      {
        id: 'high-score',
        title: 'Nota Máxima',
        description: 'Alcance 90% ou mais na nota de segurança.',
        icon: Star,
        unlocked: score >= 90,
        progress: Math.min(100, Math.round((score / 90) * 100)),
        category: 'gold',
      },
    ];
  }, [metrics]);

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const overallProgress = Math.round((unlockedCount / achievements.length) * 100);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Conquistas de Segurança
          </CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1 tabular-nums">
            {unlockedCount}/{achievements.length} desbloqueadas
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={overallProgress} className="h-1.5 flex-1" />
          <span className="text-xs font-bold tabular-nums text-muted-foreground">
            {overallProgress}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {achievements.map((achievement, i) => {
          const Icon = achievement.icon;
          const catStyle = CATEGORY_STYLES[achievement.category];
          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border transition-all",
                achievement.unlocked
                  ? cn(catStyle.border, catStyle.bg)
                  : "border-border/50 bg-muted/30 opacity-60"
              )}>
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  achievement.unlocked ? catStyle.bg : "bg-muted/50"
                )}>
                  <Icon className={cn(
                    "h-4 w-4",
                    achievement.unlocked ? catStyle.text : "text-muted-foreground"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-semibold truncate",
                      achievement.unlocked ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {achievement.title}
                    </span>
                    {achievement.unlocked && (
                      <span className="text-[10px]">{catStyle.label}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {achievement.description}
                  </p>
                  {!achievement.unlocked && (
                    <Progress value={achievement.progress} className="h-1 mt-1.5" />
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
