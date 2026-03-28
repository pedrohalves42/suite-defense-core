/**
 * Safe Mode Counter - Mostra agentes protegidos automaticamente
 * Etapa 4 do plano de melhoria 68% → 80%
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface SafeModeStats {
  active_safe_mode: number;
  total_protected_24h: number;
  total_protected_7d: number;
}

export function SafeModeCounter() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['safe-mode-stats', tenant?.id],
    queryFn: async (): Promise<SafeModeStats> => {
      if (!tenant?.id) return {
        active_safe_mode: 0,
        total_protected_24h: 0,
        total_protected_7d: 0,
      };

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get active safe mode events (not resolved)
      const { data: activeEvents } = await supabase
        .from('agent_safe_mode_events')
        .select('id')
        .eq('tenant_id', tenant.id)
        .is('resolved_at', null);

      // Get protected in last 24h
      const { data: events24h } = await supabase
        .from('agent_safe_mode_events')
        .select('id')
        .eq('tenant_id', tenant.id)
        .gte('entered_at', oneDayAgo.toISOString());

      // Get protected in last 7 days
      const { data: events7d } = await supabase
        .from('agent_safe_mode_events')
        .select('id')
        .eq('tenant_id', tenant.id)
        .gte('entered_at', sevenDaysAgo.toISOString());

      return {
        active_safe_mode: activeEvents?.length || 0,
        total_protected_24h: events24h?.length || 0,
        total_protected_7d: events7d?.length || 0,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="py-3">
          <div className="h-10 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const hasActiveProtection = stats && stats.active_safe_mode > 0;
  const hasRecentProtection = stats && stats.total_protected_7d > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      <Link to="/admin/safe-mode">
        <Card className={cn(
          "hover:bg-muted/50 transition-colors cursor-pointer",
          hasActiveProtection && "border-amber-500/30 bg-amber-500/5"
        )}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {hasActiveProtection ? (
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Proteção Automática (Safe Mode)
                    </span>
                    {hasActiveProtection && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                        {stats?.active_safe_mode} ativo
                      </Badge>
                    )}
                    {!hasActiveProtection && hasRecentProtection && (
                      <Badge variant="outline" className="text-green-600 border-green-500/50">
                        Funcionando
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stats?.total_protected_7d || 0} agente{stats?.total_protected_7d !== 1 ? 's' : ''} protegido{stats?.total_protected_7d !== 1 ? 's' : ''} nos últimos 7 dias
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <History className="h-3 w-3" />
                <span>{stats?.total_protected_24h || 0} hoje</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
