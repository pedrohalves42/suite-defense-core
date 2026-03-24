import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle, Flame, Shield, Server, Eye, Zap, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGamification } from '@/hooks/useGamification';
import { useUnifiedMetrics } from '@/hooks/useUnifiedMetrics';
import { useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const ICON_MAP: Record<string, React.ElementType> = {
  target: Target,
  shield: Shield,
  server: Server,
  eye: Eye,
  zap: Zap,
  flame: Flame,
};

interface LocalChallenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  current: number;
  xpReward: number;
  completed: boolean;
  type: 'daily' | 'weekly';
  href: string;
  actionLabel: string;
}

export function WeeklyChallenges() {
  const { metrics } = useUnifiedMetrics();
  const { profile, updateStreak } = useGamification();
  const navigate = useNavigate();
  const hasTriggeredStreakRef = useRef(false);

  useEffect(() => {
    if (profile && !hasTriggeredStreakRef.current) {
      hasTriggeredStreakRef.current = true;
      updateStreak.mutate();
    }
  }, [profile, updateStreak]);

  const challenges = useMemo<LocalChallenge[]>(() => {
    const total = metrics?.agents.total || 0;
    const online = metrics?.agents.online || 0;
    const activeAlerts = metrics?.alerts.active || 0;
    const score = metrics?.securityScore || 0;

    return [
      {
        id: 'daily-login',
        title: 'Check-in Diário',
        description: 'Acesse o dashboard hoje',
        icon: 'eye',
        target: 1,
        current: 1,
        xpReward: 10,
        completed: true,
        type: 'daily',
        href: '/admin/dashboard',
        actionLabel: 'Abrir dashboard',
      },
      {
        id: 'weekly-all-online',
        title: 'Frota Conectada',
        description: `Mantenha ${total} agentes online`,
        icon: 'server',
        target: total,
        current: online,
        xpReward: 100,
        completed: total > 0 && online === total,
        type: 'weekly',
        href: '/admin/agent-health',
        actionLabel: 'Ver saúde da frota',
      },
      {
        id: 'weekly-zero-alerts',
        title: 'Inbox Zero',
        description: 'Resolva todos os alertas pendentes',
        icon: 'shield',
        target: 1,
        current: activeAlerts === 0 ? 1 : 0,
        xpReward: 150,
        completed: activeAlerts === 0,
        type: 'weekly',
        href: '/admin/alert-resolution',
        actionLabel: 'Resolver alertas',
      },
      {
        id: 'weekly-high-score',
        title: 'Score Máximo',
        description: 'Alcance 90% na nota de segurança',
        icon: 'target',
        target: 90,
        current: Math.min(score, 90),
        xpReward: 200,
        completed: score >= 90,
        type: 'weekly',
        href: '/admin/security-graph',
        actionLabel: 'Melhorar score',
      },
      {
        id: 'streak-7',
        title: 'Streak Semanal',
        description: 'Acesse o dashboard por 7 dias seguidos',
        icon: 'flame',
        target: 7,
        current: Math.min(profile?.current_streak || 0, 7),
        xpReward: 300,
        completed: (profile?.current_streak || 0) >= 7,
        type: 'weekly',
        href: '/admin/dashboard',
        actionLabel: 'Continuar sequência',
      },
    ];
  }, [metrics, profile]);

  const completedCount = challenges.filter(c => c.completed).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Desafios da Semana
          </CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1 tabular-nums">
            {completedCount}/{challenges.length} completos
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {challenges.map((challenge, i) => {
          const Icon = ICON_MAP[challenge.icon] || Target;
          const progress = challenge.target > 0
            ? Math.round((challenge.current / challenge.target) * 100)
            : 0;

          return (
            <motion.button
              key={challenge.id}
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.995 }}
              onClick={() => navigate(challenge.href)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                challenge.completed
                  ? 'border-success/30 bg-success/5 hover:border-primary/30'
                  : 'border-border/50 bg-muted/20 hover:border-primary/30 hover:bg-muted/40'
              )}
            >
              <div className={cn(
                'p-2 rounded-lg shrink-0',
                challenge.completed ? 'bg-success/10' : 'bg-muted/50'
              )}>
                {challenge.completed ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-semibold truncate',
                    challenge.completed ? 'text-success' : 'text-foreground'
                  )}>
                    {challenge.title}
                  </span>
                  <Badge variant={challenge.type === 'daily' ? 'secondary' : 'outline'} className="text-[9px] px-1.5">
                    {challenge.type === 'daily' ? 'Diário' : 'Semanal'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {challenge.description}
                </p>
                {!challenge.completed && (
                  <Progress value={progress} className="h-1 mt-1.5" />
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={cn(
                  'text-[10px] font-bold tabular-nums',
                  challenge.completed ? 'text-success' : 'text-primary'
                )}>
                  +{challenge.xpReward} XP
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {challenge.actionLabel}
                  <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </motion.button>
          );
        })}
      </CardContent>
    </Card>
  );
}
