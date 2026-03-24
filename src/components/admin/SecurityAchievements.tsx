import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Trophy,
  Shield,
  Server,
  Eye,
  Lock,
  Zap,
  Star,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useUnifiedMetrics } from '@/hooks/useUnifiedMetrics';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  unlocked: boolean;
  progress: number;
  category: 'bronze' | 'silver' | 'gold';
  href: string;
  actionLabel: string;
}

const CATEGORY_STYLES = {
  bronze: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/20', label: '🥉 Bronze' },
  silver: { bg: 'bg-slate-400/10', text: 'text-slate-400', border: 'border-slate-400/20', label: '🥈 Prata' },
  gold: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20', label: '🏆 Ouro' },
};

export function SecurityAchievements() {
  const { metrics } = useUnifiedMetrics();
  const navigate = useNavigate();

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
        href: '/admin/agent-center',
        actionLabel: total > 0 ? 'Ver agentes' : 'Cadastrar agora',
      },
      {
        id: 'all-online',
        title: 'Frota Completa',
        description: 'Mantenha todos os computadores online.',
        icon: Zap,
        unlocked: total > 0 && online === total,
        progress: total > 0 ? Math.round((online / total) * 100) : 0,
        category: 'silver',
        href: '/admin/agent-health',
        actionLabel: 'Abrir saúde da frota',
      },
      {
        id: 'zero-critical',
        title: 'Zero Críticos',
        description: 'Resolva todos os alertas críticos.',
        icon: Shield,
        unlocked: critAlerts === 0,
        progress: critAlerts === 0 ? 100 : Math.max(0, 100 - critAlerts * 20),
        category: 'gold',
        href: '/admin/alert-resolution',
        actionLabel: 'Resolver alertas',
      },
      {
        id: 'inbox-zero',
        title: 'Inbox Zero',
        description: 'Resolva ou reconheça todos os alertas pendentes.',
        icon: Eye,
        unlocked: activeAlerts === 0,
        progress: activeAlerts === 0 ? 100 : Math.max(0, 100 - activeAlerts * 10),
        category: 'silver',
        href: '/admin/threat-center?tab=alerts',
        actionLabel: 'Abrir central',
      },
      {
        id: 'no-vulns',
        title: 'Blindagem Total',
        description: 'Elimine todas as vulnerabilidades críticas.',
        icon: Lock,
        unlocked: vulns === 0,
        progress: vulns === 0 ? 100 : Math.max(0, 100 - vulns * 15),
        category: 'gold',
        href: '/admin/vulnerability-center?tab=vulnerabilities',
        actionLabel: 'Corrigir pontos fracos',
      },
      {
        id: 'high-score',
        title: 'Nota Máxima',
        description: 'Alcance 90% ou mais na nota de segurança.',
        icon: Star,
        unlocked: score >= 90,
        progress: Math.min(100, Math.round((score / 90) * 100)),
        category: 'gold',
        href: '/admin/security-graph',
        actionLabel: 'Ver nota de segurança',
      },
    ];
  }, [metrics]);

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const overallProgress = Math.round((unlockedCount / achievements.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-semibold">Conquistas</span>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1 tabular-nums">
          {unlockedCount}/{achievements.length}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={overallProgress} className="h-1.5 flex-1" />
        <span className="text-xs font-bold tabular-nums text-muted-foreground">
          {overallProgress}%
        </span>
      </div>
      <div className="space-y-1.5">
        {achievements.map((achievement, i) => {
          const Icon = achievement.icon;
          const catStyle = CATEGORY_STYLES[achievement.category];

          return (
            <motion.button
              key={achievement.id}
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.995 }}
              onClick={() => navigate(achievement.href)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                achievement.unlocked
                  ? cn(catStyle.border, catStyle.bg, 'hover:border-primary/40')
                  : 'border-border/50 bg-muted/30 opacity-80 hover:border-primary/30 hover:bg-muted/50'
              )}
            >
              <motion.div
                className={cn(
                  'p-2 rounded-lg shrink-0',
                  achievement.unlocked ? catStyle.bg : 'bg-muted/50'
                )}
                animate={achievement.unlocked ? {
                  scale: [1, 1.15, 1],
                  rotate: [0, 5, -5, 0],
                } : {}}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <Icon className={cn(
                  'h-4 w-4',
                  achievement.unlocked ? catStyle.text : 'text-muted-foreground'
                )} />
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-semibold truncate',
                    achievement.unlocked ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {achievement.title}
                  </span>
                  {achievement.unlocked && (
                    <motion.span
                      className="text-[10px]"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: i * 0.1 + 0.3 }}
                    >
                      {catStyle.label}
                    </motion.span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {achievement.description}
                </p>
                {!achievement.unlocked && (
                  <Progress value={achievement.progress} className="mt-1.5 h-1" />
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {achievement.progress}%
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {achievement.actionLabel}
                  <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
