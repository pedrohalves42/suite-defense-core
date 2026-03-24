/**
 * useGamification — Hook central de gamificação
 * Gerencia XP, níveis, streaks, desafios e leaderboard
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// === XP Rewards por ação ===
export const XP_REWARDS: Record<string, { xp: number; label: string }> = {
  enroll_agent: { xp: 100, label: 'Agente instalado' },
  resolve_alert: { xp: 50, label: 'Alerta resolvido' },
  resolve_critical: { xp: 150, label: 'Alerta crítico resolvido' },
  run_scan: { xp: 30, label: 'Scan executado' },
  configure_backup: { xp: 80, label: 'Backup configurado' },
  update_agent: { xp: 40, label: 'Agente atualizado' },
  fix_vulnerability: { xp: 120, label: 'Vulnerabilidade corrigida' },
  acknowledge_alert: { xp: 20, label: 'Alerta reconhecido' },
  daily_login: { xp: 10, label: 'Login diário' },
  perfect_score: { xp: 200, label: 'Score 100% alcançado' },
  streak_7: { xp: 300, label: 'Streak de 7 dias' },
  streak_30: { xp: 1000, label: 'Streak de 30 dias' },
};

// === Níveis e títulos ===
export const LEVELS = [
  { level: 1, title: 'Recruta', xpRequired: 0, emoji: '🛡️' },
  { level: 2, title: 'Sentinela', xpRequired: 200, emoji: '⚔️' },
  { level: 3, title: 'Guardião', xpRequired: 500, emoji: '🏰' },
  { level: 4, title: 'Protetor', xpRequired: 1000, emoji: '🔰' },
  { level: 5, title: 'Defensor', xpRequired: 2000, emoji: '🦾' },
  { level: 6, title: 'Estrategista', xpRequired: 3500, emoji: '🧠' },
  { level: 7, title: 'Comandante', xpRequired: 5000, emoji: '⭐' },
  { level: 8, title: 'Especialista', xpRequired: 7500, emoji: '💎' },
  { level: 9, title: 'Mestre', xpRequired: 10000, emoji: '👑' },
  { level: 10, title: 'Lenda da Segurança', xpRequired: 15000, emoji: '🏆' },
];

export function getLevelFromXP(xp: number) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.xpRequired) current = lvl;
    else break;
  }
  const nextIdx = LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = nextIdx < LEVELS.length ? LEVELS[nextIdx] : null;
  const xpInLevel = xp - current.xpRequired;
  const xpToNext = next ? next.xpRequired - current.xpRequired : 0;
  const progressPercent = next ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 100;

  return { ...current, xpInLevel, xpToNext, progressPercent, nextLevel: next };
}

export interface GamificationProfile {
  id: string;
  user_id: string;
  tenant_id: string;
  xp: number;
  level: number;
  level_title: string;
  current_streak: number;
  best_streak: number;
  last_streak_date: string | null;
  badges_unlocked: string[];
}

export interface LeaderboardEntry {
  user_id: string;
  xp: number;
  level: number;
  level_title: string;
  current_streak: number;
  full_name: string | null;
}

export function useGamification() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;
  const userId = user?.id;

  // Retroactive XP sync — awards XP for things already done when profile is new (0 XP)
  const retroSyncDone = useRef(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['gamification-profile', userId, tenantId],
    queryFn: async () => {
      if (!userId || !tenantId) return null;

      const { data, error } = await supabase
        .from('user_gamification')
        .select('*')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const { data: newProfile, error: insertError } = await supabase
          .from('user_gamification')
          .insert({ user_id: userId, tenant_id: tenantId })
          .select()
          .single();
        if (insertError) throw insertError;
        return newProfile as GamificationProfile;
      }

      return data as GamificationProfile;
    },
    enabled: !!userId && !!tenantId,
  });

  // Retroactive sync: award XP for actions already completed when profile is fresh (0 XP)
  useEffect(() => {
    if (retroSyncDone.current || !profile || !userId || !tenantId) return;
    if (profile.xp > 0) {
      retroSyncDone.current = true;
      return;
    }

    retroSyncDone.current = true;

    (async () => {
      try {
        // Check existing XP events — if any exist, skip (profile was reset, not new)
        const { count: existingEvents } = await supabase
          .from('xp_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('tenant_id', tenantId);

        if ((existingEvents || 0) > 0) return;

        // Count agents enrolled by this tenant
        const agentsRes = await supabase
          .rpc('get_agents_list', { p_tenant_id: tenantId });
        const agentCount = (agentsRes.data as any[] || []).length;

        // Count resolved alerts
        const { count: resolvedAlerts } = await supabase
          .from('system_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ['resolved', 'closed']);

        let totalXP = 0;
        const events: Array<{ user_id: string; tenant_id: string; action: string; xp_earned: number; description: string }> = [];

        const numAgents = agentCount;
        if (numAgents > 0) {
          const xp = Math.min(numAgents, 10) * XP_REWARDS.enroll_agent.xp;
          totalXP += xp;
          events.push({
            user_id: userId,
            tenant_id: tenantId,
            action: 'retro_agents',
            xp_earned: xp,
            description: `Retroativo: ${numAgents} agente(s) já instalado(s)`,
          });
        }

        const numResolved = resolvedAlerts || 0;
        if (numResolved > 0) {
          const xp = Math.min(numResolved, 20) * XP_REWARDS.resolve_alert.xp;
          totalXP += xp;
          events.push({
            user_id: userId,
            tenant_id: tenantId,
            action: 'retro_alerts',
            xp_earned: xp,
            description: `Retroativo: ${numResolved} alerta(s) já resolvido(s)`,
          });
        }

        // Daily login bonus
        totalXP += XP_REWARDS.daily_login.xp;
        events.push({
          user_id: userId,
          tenant_id: tenantId,
          action: 'daily_login',
          xp_earned: XP_REWARDS.daily_login.xp,
          description: XP_REWARDS.daily_login.label,
        });

        if (events.length > 0) {
          await supabase.from('xp_events').insert(events);

          const newLevel = getLevelFromXP(totalXP);
          await supabase
            .from('user_gamification')
            .update({
              xp: totalXP,
              level: newLevel.level,
              level_title: newLevel.title,
              current_streak: 1,
              last_streak_date: new Date().toISOString().split('T')[0],
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('tenant_id', tenantId);

          queryClient.invalidateQueries({ queryKey: ['gamification-profile'] });
          queryClient.invalidateQueries({ queryKey: ['xp-history'] });
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

          toast.success(`🎮 +${totalXP} XP retroativo concedido!`, { duration: 5000, icon: '⚡' });
        }
      } catch (err) {
        console.error('[Gamification] Retro sync failed:', err);
      }
    })();
  }, [profile, userId, tenantId]);

  const { data: xpHistory } = useQuery({
    queryKey: ['xp-history', userId, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('xp_events')
        .select('*')
        .eq('user_id', userId!)
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!tenantId,
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_gamification')
        .select('user_id, xp, level, level_title, current_streak')
        .eq('tenant_id', tenantId!)
        .order('xp', { ascending: false })
        .limit(10);
      if (error) throw error;

      const userIds = (data || []).map(d => d.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));

      return (data || []).map(entry => ({
        ...entry,
        full_name: profileMap.get(entry.user_id) || 'Usuário',
      })) as LeaderboardEntry[];
    },
    enabled: !!tenantId,
  });

  const { data: challenges } = useQuery({
    queryKey: ['challenges', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gamification_challenges')
        .select('*, challenge_progress(*)')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .gte('ends_at', new Date().toISOString());
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const awardXP = useMutation({
    mutationFn: async ({ action, customXP, customLabel }: { action: string; customXP?: number; customLabel?: string }) => {
      if (!userId || !tenantId || !profile) throw new Error('Not ready');

      const reward = XP_REWARDS[action];
      const xpAmount = customXP || reward?.xp || 10;
      const label = customLabel || reward?.label || action;

      await supabase.from('xp_events').insert({
        user_id: userId,
        tenant_id: tenantId,
        action,
        xp_earned: xpAmount,
        description: label,
      });

      const newXP = (profile.xp || 0) + xpAmount;
      const newLevel = getLevelFromXP(newXP);

      await supabase
        .from('user_gamification')
        .update({
          xp: newXP,
          level: newLevel.level,
          level_title: newLevel.title,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('tenant_id', tenantId);

      return { xpAmount, label, newXP, newLevel, leveledUp: newLevel.level > (profile.level || 1) };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['gamification-profile'] });
      queryClient.invalidateQueries({ queryKey: ['xp-history'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

      toast.success(`+${result.xpAmount} XP — ${result.label}`, {
        duration: 3000,
        icon: '⚡',
      });

      if (result.leveledUp) {
        setTimeout(() => {
          toast.success(`🎉 Nível ${result.newLevel.level}! Agora você é ${result.newLevel.emoji} ${result.newLevel.title}`, {
            duration: 6000,
          });
        }, 500);
      }
    },
  });

  const updateStreak = useMutation({
    mutationFn: async () => {
      if (!userId || !tenantId || !profile) return null;

      const today = new Date().toISOString().split('T')[0];
      const lastDate = profile.last_streak_date;

      if (lastDate === today) return null;

      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const newStreak = lastDate === yesterday ? (profile.current_streak || 0) + 1 : 1;
      const newBest = Math.max(newStreak, profile.best_streak || 0);

      await supabase
        .from('user_gamification')
        .update({
          current_streak: newStreak,
          best_streak: newBest,
          last_streak_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('tenant_id', tenantId);

      return { newStreak, newBest, awardedDailyLogin: true };
    },
    onSuccess: (result) => {
      if (!result) return;

      queryClient.invalidateQueries({ queryKey: ['gamification-profile'] });

      if (result.awardedDailyLogin) {
        awardXP.mutate({ action: 'daily_login' });
      }

      if (result.newStreak === 7) {
        awardXP.mutate({ action: 'streak_7' });
      } else if (result.newStreak === 30) {
        awardXP.mutate({ action: 'streak_30' });
      }
    },
  });

  const levelInfo = getLevelFromXP(profile?.xp || 0);

  return {
    profile,
    isLoading,
    levelInfo,
    xpHistory: xpHistory || [],
    leaderboard: leaderboard || [],
    challenges: challenges || [],
    awardXP,
    updateStreak,
  };
}
