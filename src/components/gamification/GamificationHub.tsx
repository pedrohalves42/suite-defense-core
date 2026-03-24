import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Target, Users, Zap, Flame, Star, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamification } from '@/hooks/useGamification';
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

        {profile && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
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

            <div className="mt-2 flex items-center gap-4">
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
          <TabsList className="mb-2 grid h-auto w-full grid-cols-4 gap-1 bg-muted/40 p-1">
            <TabsTrigger value="overview" className="h-8 cursor-pointer gap-1 rounded-md text-[11px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Trophy className="h-3 w-3" /> Conquistas
            </TabsTrigger>
            <TabsTrigger value="challenges" className="h-8 cursor-pointer gap-1 rounded-md text-[11px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Target className="h-3 w-3" /> Desafios
            </TabsTrigger>
            <TabsTrigger value="ranking" className="h-8 cursor-pointer gap-1 rounded-md text-[11px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="h-3 w-3" /> Ranking
            </TabsTrigger>
            <TabsTrigger value="history" className="h-8 cursor-pointer gap-1 rounded-md text-[11px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Clock className="h-3 w-3" /> Histórico
            </TabsTrigger>
          </TabsList>

          <p className="mb-3 text-[10px] text-muted-foreground">
            Clique em qualquer conquista, desafio ou posição do ranking para abrir a área correspondente.
          </p>

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
          className="flex items-center gap-3 rounded-lg border border-border/40 p-2"
        >
          <div className="shrink-0 rounded-md bg-yellow-500/10 p-1.5">
            <Zap className="h-3 w-3 text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium">{event.description || event.action}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(event.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums text-yellow-500">
            +{event.xp_earned}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
