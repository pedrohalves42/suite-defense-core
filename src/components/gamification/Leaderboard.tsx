import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Crown, User, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGamification, getLevelFromXP } from '@/hooks/useGamification';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const RANK_STYLES = [
  { icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  { icon: Medal, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' },
  { icon: Medal, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
];

export function Leaderboard() {
  const { leaderboard, isLoading } = useGamification();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (isLoading) return null;

  if (leaderboard.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Ranking do Time
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <button
            type="button"
            onClick={() => navigate('/admin/members')}
            className="group flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div>
              <p className="text-xs font-semibold text-foreground">Ainda não há ranking para este tenant</p>
              <p className="text-[11px] text-muted-foreground">Abra a área de membros para acompanhar o time.</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              Ver equipe
              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </CardContent>
      </Card>
    );
  }

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
            <motion.button
              key={entry.user_id}
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.995 }}
              onClick={() => navigate('/admin/members')}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isMe ? 'border-primary/30 bg-primary/5' : 'border-border/40 hover:border-primary/30 hover:bg-muted/30',
                rankStyle ? cn(rankStyle.border, rankStyle.bg) : ''
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                rankStyle ? cn(rankStyle.bg) : 'bg-muted'
              )}>
                {i < 3 ? (
                  <RankIcon className={cn('h-4 w-4', rankStyle?.color)} />
                ) : (
                  <span className="text-muted-foreground">{i + 1}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-xs font-semibold truncate',
                    isMe ? 'text-primary' : 'text-foreground'
                  )}>
                    {entry.full_name || 'Usuário'}
                    {isMe && <span className="text-muted-foreground ml-1">(você)</span>}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lvl.emoji} {lvl.title} • Nv.{lvl.level}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    {entry.xp.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground">XP</p>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </motion.button>
          );
        })}
      </CardContent>
    </Card>
  );
}
