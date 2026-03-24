/**
 * GamificationHub — Painel completo de gamificação
 * Combina XP, conquistas, desafios e leaderboard em um único widget
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Target, Users, Zap, Flame, Star, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGamification, getLevelFromXP, LEVELS } from '@/hooks/useGamification';
import { SecurityAchievements } from '@/components/admin/SecurityAchievements';
import { WeeklyChallenges } from '@/components/gamification/WeeklyChallenges';
import { Leaderboard } from '@/components/gamification/Leaderboard';

export function GamificationHub() {
  const { profile, levelInfo, xpHistory, isLoading } = useGamification();
  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Centro de Gamificação
          </CardTitle>
          {profile && (
            <Badge variant="outline" className="text-[10px] gap-1">
              {levelInfo.emoji} Nv.{levelInfo.level}
            </Badge>
          )}
        </div>

        {/* XP bar inline */}
        {profile && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3 text-yellow-500" />
                {profile.xp.toLocaleString()} XP — {levelInfo.title}
              </span>
              {levelInfo.nextLevel && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  Próx: {levelInfo.nextLevel.title} ({levelInfo.nextLevel.xpRequired.toLocaleString()} XP)
                </span>
              )}
            </div>
            <Progress value={levelInfo.progressPercent} className="h-1.5" />

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Flame className="h-3 w-3 text-orange-500" />
                Streak: <span className="font-bold text-foreground">{profile.current_streak || 0}d</span>
                {(profile.best_streak || 0) > 0 && (
                  <span className="text-muted-foreground/60">(recorde: {profile.best_streak}d)</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Star className="h-3 w-3 text-yellow-500" />
                Badges: <span className="font-bold text-foreground">{profile.badges_unlocked?.length || 0}</span>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full h-8 mb-3">
            <TabsTrigger value="overview" className="text-[11px] flex-1 gap-1">
              <Trophy className="h-3 w-3" /> Conquistas
            </TabsTrigger>
            <TabsTrigger value="challenges" className="text-[11px] flex-1 gap-1">
              <Target className="h-3 w-3" /> Desafios
            </TabsTrigger>
            <TabsTrigger value="ranking" className="text-[11px] flex-1 gap-1">
              <Users className="h-3 w-3" /> Ranking
            </TabsTrigger>
            <TabsTrigger value="history" className="text-[11px] flex-1 gap-1">
              <Clock className="h-3 w-3" /> Histórico
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="overview" className="mt-0">
              <SecurityAchievements />
            </TabsContent>

            <TabsContent value="challenges" className="mt-0">
              <WeeklyChallenges />
            </TabsContent>

            <TabsContent value="ranking" className="mt-0">
              <Leaderboard />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <XPHistoryList history={xpHistory} />
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function XPHistoryList({ history }: { history: Array<{ id: string; action: string; xp_earned: number; description: string | null; created_at: string }> }) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <Zap className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">Nenhum XP ganho ainda</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Instale agentes, resolva alertas e complete desafios para ganhar XP!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto">
      {history.map((event, i) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-center gap-3 p-2 rounded-lg border border-border/40"
        >
          <div className="p-1.5 rounded-md bg-yellow-500/10 shrink-0">
            <Zap className="h-3 w-3 text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{event.description || event.action}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(event.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <span className="text-xs font-bold text-yellow-500 tabular-nums shrink-0">
            +{event.xp_earned}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
