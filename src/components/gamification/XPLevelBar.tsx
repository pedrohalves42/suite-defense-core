import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useGamification, getLevelFromXP } from '@/hooks/useGamification';
import { Zap, Flame, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function XPLevelBar() {
  const { profile, levelInfo, isLoading } = useGamification();

  if (isLoading || !profile) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card/50 backdrop-blur-sm"
    >
      {/* Level badge */}
      <div className="flex items-center gap-1.5">
        <span className="text-lg">{levelInfo.emoji}</span>
        <div className="leading-none">
          <span className="text-[10px] text-muted-foreground font-medium">Nv.{levelInfo.level}</span>
          <p className="text-xs font-bold text-foreground">{levelInfo.title}</p>
        </div>
      </div>

      {/* XP progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] tabular-nums text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            {profile.xp.toLocaleString()} XP
          </span>
          {levelInfo.nextLevel && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {levelInfo.nextLevel.xpRequired.toLocaleString()} XP
            </span>
          )}
        </div>
        <Progress value={levelInfo.progressPercent} className="h-1.5" />
      </div>

      {/* Streak */}
      {(profile.current_streak || 0) > 0 && (
        <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
          <Flame className="h-3 w-3 text-orange-500" />
          {profile.current_streak}d
        </Badge>
      )}
    </motion.div>
  );
}
