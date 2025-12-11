import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CheckCircle2, Server, Bell, BellOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/date-utils';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface OfflineAgent {
  agent_id: string;
  agent_name: string;
  last_heartbeat: string;
  offline_hours: number;
  hostname: string | null;
  os_type: string | null;
}

type SeverityLevel = 'warning' | 'danger' | 'critical';

const getSeverity = (hours: number): SeverityLevel => {
  if (hours >= 8) return 'critical';
  if (hours >= 4) return 'danger';
  return 'warning';
};

const severityConfig = {
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-700 dark:text-yellow-400',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    icon: 'text-yellow-500',
  },
  danger: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-400',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    icon: 'text-orange-500',
  },
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    icon: 'text-red-500',
  },
};

export function OfflineAgentAlerts() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [acknowledgedAgents, setAcknowledgedAgents] = useState<Set<string>>(new Set());
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  // Fetch agents offline for more than 1 hour
  const { data: offlineAgents = [], isLoading } = useQuery({
    queryKey: ['offline-agents-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, last_heartbeat, hostname, os_type')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .lt('last_heartbeat', oneHourAgo)
        .order('last_heartbeat', { ascending: true });

      if (error) throw error;

      return (data || []).map((agent) => {
        const lastHeartbeat = new Date(agent.last_heartbeat);
        const now = new Date();
        const offlineHours = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60 * 60);

        return {
          agent_id: agent.id,
          agent_name: agent.agent_name,
          last_heartbeat: agent.last_heartbeat,
          offline_hours: Math.round(offlineHours * 10) / 10,
          hostname: agent.hostname,
          os_type: agent.os_type,
        } as OfflineAgent;
      });
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Realtime subscription for agent status changes
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('offline-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          // Refresh the query when an agent's heartbeat changes
          queryClient.invalidateQueries({ queryKey: ['offline-agents-alerts', tenant.id] });

          // Check if agent came back online
          const newAgent = payload.new as { agent_name: string; last_heartbeat: string };
          const oldAgent = payload.old as { last_heartbeat: string };

          if (newAgent.last_heartbeat && newAgent.last_heartbeat !== oldAgent.last_heartbeat) {
            const lastHb = new Date(newAgent.last_heartbeat);
            const now = new Date();
            const minutesSinceHb = (now.getTime() - lastHb.getTime()) / (1000 * 60);

            // Agent is now online (heartbeat within last 5 minutes)
            if (minutesSinceHb < 5) {
              toast.success(`✅ ${newAgent.agent_name} está online novamente!`, {
                duration: 5000,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  const handleAcknowledge = (agentId: string, agentName: string) => {
    setAcknowledgedAgents((prev) => new Set([...prev, agentId]));
    toast.success(`Alerta de ${agentName} reconhecido`, { duration: 2000 });
  };

  const handleAcknowledgeAll = () => {
    const allIds = offlineAgents.map((a) => a.agent_id);
    setAcknowledgedAgents(new Set(allIds));
    toast.success(`${allIds.length} alertas reconhecidos`, { duration: 2000 });
  };

  // Filter agents based on acknowledged state
  const displayedAgents = showAcknowledged
    ? offlineAgents
    : offlineAgents.filter((a) => !acknowledgedAgents.has(a.agent_id));

  const unacknowledgedCount = offlineAgents.filter((a) => !acknowledgedAgents.has(a.agent_id)).length;

  // Don't render if no offline agents
  if (!isLoading && offlineAgents.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50/50 to-orange-50/30 dark:from-red-950/20 dark:to-orange-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/50 animate-pulse">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Alertas de Agentes Offline
                  {unacknowledgedCount > 0 && (
                    <Badge variant="destructive" className="animate-pulse">
                      {unacknowledgedCount}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  Agentes sem comunicação há mais de 1 hora
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAcknowledged(!showAcknowledged)}
                className="text-xs"
              >
                {showAcknowledged ? (
                  <>
                    <BellOff className="h-4 w-4 mr-1" />
                    Ocultar Reconhecidos
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-1" />
                    Mostrar Todos ({offlineAgents.length})
                  </>
                )}
              </Button>
              {unacknowledgedCount > 1 && (
                <Button variant="outline" size="sm" onClick={handleAcknowledgeAll} className="text-xs">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Reconhecer Todos
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Clock className="h-4 w-4 animate-spin mr-2" />
              Verificando agentes...
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {displayedAgents.map((agent) => {
                  const severity = getSeverity(agent.offline_hours);
                  const config = severityConfig[severity];
                  const isAcknowledged = acknowledgedAgents.has(agent.agent_id);

                  return (
                    <motion.div
                      key={agent.agent_id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: isAcknowledged ? 0.6 : 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border transition-all',
                        config.bg,
                        config.border,
                        isAcknowledged && 'opacity-60'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Server className={cn('h-5 w-5', config.icon)} />
                        <div>
                          <p className={cn('font-medium', config.text)}>{agent.agent_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {agent.hostname && `${agent.hostname} • `}
                            Offline {formatRelativeTime(agent.last_heartbeat)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-xs', config.badge)}>
                          {severity === 'critical' && '🔴 CRÍTICO'}
                          {severity === 'danger' && '🟠 ALERTA'}
                          {severity === 'warning' && '🟡 ATENÇÃO'}
                          <span className="ml-1">({Math.round(agent.offline_hours)}h)</span>
                        </Badge>

                        {!isAcknowledged && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAcknowledge(agent.agent_id, agent.agent_name)}
                            className="h-7 px-2"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {displayedAgents.length === 0 && offlineAgents.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  Todos os alertas foram reconhecidos ✓
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
