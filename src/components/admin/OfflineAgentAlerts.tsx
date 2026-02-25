import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CheckCircle2, Server, Bell, BellOff, Coffee } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

interface BusinessHours {
  enabled: boolean;
  timezone: string;
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  start: string; // "08:00"
  end: string; // "18:00"
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: true,
  timezone: 'America/Sao_Paulo',
  days: [1, 2, 3, 4, 5], // Mon-Fri
  start: '08:00',
  end: '18:00',
};

type SeverityLevel = 'warning' | 'danger' | 'critical' | 'info';

const getSeverity = (hours: number, isBusinessHours: boolean): SeverityLevel => {
  // Fora do expediente, severidade é sempre info
  if (!isBusinessHours) return 'info';
  
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
  info: {
    bg: 'bg-slate-50 dark:bg-slate-950/30',
    border: 'border-slate-200 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: 'text-slate-400',
  },
};

/**
 * Verifica se o horário atual está dentro do horário de expediente configurado
 */
function isWithinBusinessHours(businessHours: BusinessHours): boolean {
  if (!businessHours.enabled) return true; // Se desabilitado, considera sempre como expediente
  
  try {
    // Obter data/hora atual no timezone configurado
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: businessHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    
    const parts = formatter.formatToParts(now);
    const weekdayPart = parts.find(p => p.type === 'weekday')?.value || '';
    const hourPart = parts.find(p => p.type === 'hour')?.value || '00';
    const minutePart = parts.find(p => p.type === 'minute')?.value || '00';
    
    // Mapear dia da semana
    const weekdayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
    };
    const currentDay = weekdayMap[weekdayPart] ?? new Date().getDay();
    
    // Verificar se é dia de expediente
    if (!businessHours.days.includes(currentDay)) {
      return false;
    }
    
    // Verificar horário
    const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);
    const [startHour, startMin] = businessHours.start.split(':').map(Number);
    const [endHour, endMin] = businessHours.end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    console.error('Error checking business hours:', error);
    return true; // Em caso de erro, considera como expediente
  }
}

export function OfflineAgentAlerts() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [acknowledgedAgents, setAcknowledgedAgents] = useState<Set<string>>(new Set());
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  // Fetch business hours configuration
  const { data: businessHours = DEFAULT_BUSINESS_HOURS } = useQuery({
    queryKey: ['tenant-business-hours', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return DEFAULT_BUSINESS_HOURS;
      
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('business_hours')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (error || !data?.business_hours) {
        return DEFAULT_BUSINESS_HOURS;
      }
      
      // Safe type assertion with validation
      const bh = data.business_hours as unknown as BusinessHours;
      if (bh && typeof bh.enabled === 'boolean' && Array.isArray(bh.days)) {
        return bh;
      }
      return DEFAULT_BUSINESS_HOURS;
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Check if currently within business hours
  const isBusinessHoursActive = useMemo(() => {
    return isWithinBusinessHours(businessHours);
  }, [businessHours]);

  // Fetch agents offline for more than 1 hour
  const { data: offlineAgents = [], isLoading } = useQuery({
    queryKey: ['offline-agents-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });

      if (error) throw error;

      const data = ((agentsRaw || []) as any[])
        .filter((a: any) => a.status === 'active' && a.last_heartbeat && a.last_heartbeat < oneHourAgo)
        .map((a: any) => ({ id: a.id, agent_name: a.agent_name, last_heartbeat: a.last_heartbeat, hostname: a.hostname, os_type: a.os_type }))
        .sort((a: any, b: any) => a.last_heartbeat.localeCompare(b.last_heartbeat));

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
    refetchInterval: 300000, // COST-OPT: 60s → 5min
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

  // Render simplified version outside business hours
  if (!isBusinessHoursActive && offlineAgents.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-l-4 border-l-slate-400 bg-gradient-to-br from-slate-50/50 to-slate-100/30 dark:from-slate-950/20 dark:to-slate-900/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Coffee className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  Fora do Horário de Expediente
                  <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700">
                    {offlineAgents.length} offline
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  {offlineAgents.length} agente(s) offline — comportamento esperado fora do expediente
                  ({businessHours.start} - {businessHours.end})
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>
    );
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
                  Agentes sem comunicação há mais de 1 hora (horário de expediente)
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
                  const severity = getSeverity(agent.offline_hours, isBusinessHoursActive);
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
                          {severity === 'info' && '⚪ INFO'}
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
