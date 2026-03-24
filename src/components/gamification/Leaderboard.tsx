import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Crown, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGamification, getLevelFromXP } from '@/hooks/useGamification';
import { useAuth } from '@/hooks/useAuth';

const RANK_STYLES = [
  { icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  { icon: Medal, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' },
  { icon: Medal, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
];

export function Leaderboard() {
  const { leaderboard, isLoading } = useGamification();
  const { user } = useAuth();

  if (isLoading || leaderboard.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Ranking do Time
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {leaderboard.map((entry, i) => {
          const rankStyle = RANK_STYLES[i] || null;
          const lvl = getLevelFromXP(entry.xp);
          const isMe = entry.user_id === user?.id;
          const RankIcon = rankStyle?.icon || User;

          return (
            <motion.div
              key={entry.user_id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className={cn(
                "flex items-center gap-3 p-2 rounded-lg border transition-all",
                isMe ? "border-primary/30 bg-primary/5" : "border-border/40",
                rankStyle ? cn(rankStyle.border, rankStyle.bg) : ""
              )}>
                {/* Rank */}
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                  rankStyle ? cn(rankStyle.bg) : "bg-muted"
                )}>
                  {i < 3 ? (
                    <RankIcon className={cn("h-4 w-4", rankStyle?.color)} />
                  ) : (
                    <span className="text-muted-foreground">{i + 1}</span>
                  )}
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-xs font-semibold truncate",
                      isMe ? "text-primary" : "text-foreground"
                    )}>
                      {entry.full_name || 'Usuário'}
                      {isMe && <span className="text-muted-foreground ml-1">(você)</span>}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {lvl.emoji} {lvl.title} • Nv.{lvl.level}
                  </p>
                </div>

                {/* XP */}
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    {entry.xp.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground">XP</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
