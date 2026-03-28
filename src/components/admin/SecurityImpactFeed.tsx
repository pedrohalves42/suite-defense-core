/**
 * Security Impact Feed
 * Shows daily auto-remediation actions with financial impact estimation
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Shield, ShieldCheck, Zap, Bug, Cpu, HardDrive,
  Wifi, Lock, FileWarning, TrendingUp, DollarSign,
  CheckCircle, AlertTriangle, Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface ImpactMetric {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  bgColor: string;
}

// Estimated cost per incident type (based on industry averages)
const INCIDENT_COST_MAP: Record<string, number> = {
  kill_process: 2500,        // Malware incident avg cost
  firewall_block: 1800,      // Network breach attempt
  quarantine_file: 3000,     // File-based threat
  restart_service: 500,      // Service disruption
  patch_apply: 4000,         // Unpatched vulnerability exploit
  enable_antivirus: 1200,    // AV gap exposure
  enable_firewall: 2000,     // Firewall gap exposure
  block_usb_device: 1500,    // Data exfiltration attempt
  suggest_patch: 3500,       // Critical vuln exposure
  disk_cleanup: 200,         // Disk failure prevention
};

export function SecurityImpactFeed() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  // Fetch today's remediation actions
  const { data: remediationActions } = useQuery({
    queryKey: ['impact-feed-remediation', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('auto_remediation_actions')
        .select('id, action_type, status, trigger_source, agent_name, created_at, trigger_details')
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch today's automation executions
  const { data: automationExecs } = useQuery({
    queryKey: ['impact-feed-automations', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('automation_executions')
        .select('id, rule_id, agent_id, action_taken, status, trigger_data, executed_at')
        .eq('tenant_id', tenant.id)
        .gte('executed_at', today.toISOString())
        .eq('status', 'executed');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch today's playbook executions
  const { data: playbookExecs } = useQuery({
    queryKey: ['impact-feed-playbooks', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('playbook_executions')
        .select('id, playbook_id, status, auto_executed, dry_run, triggered_at')
        .eq('tenant_id', tenant.id)
        .gte('triggered_at', today.toISOString());
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch weekly trend for comparison
  const { data: weeklyStats } = useQuery({
    queryKey: ['impact-feed-weekly', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { actions: 0, avgDaily: 0 };
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const { count, error } = await supabase
        .from('auto_remediation_actions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', weekAgo.toISOString());
      
      if (error) throw error;
      return { actions: count || 0, avgDaily: Math.round((count || 0) / 7) };
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const impactMetrics: ImpactMetric[] = useMemo(() => {
    const processesKilled = (remediationActions || []).filter(a => a.action_type === 'kill_process').length;
    const servicesRestarted = (remediationActions || []).filter(a => 
      a.action_type === 'restart_service' || a.action_type === 'enable_antivirus'
    ).length;
    const anomaliesIsolated = (playbookExecs || []).filter(e => 
      e.auto_executed && (e.status === 'completed' || e.status === 'success')
    ).length;
    const agentsRecovered = (automationExecs || []).filter(e => {
      const data = e.trigger_data as Record<string, unknown> | null;
      return data && (data.event_type === 'agent_offline' || data.action === 'restart_service');
    }).length;
    const threatsPrevented = (remediationActions || []).filter(a =>
      ['firewall_block', 'quarantine_file', 'block_usb_device'].includes(a.action_type)
    ).length;
    const patchesSuggested = (remediationActions || []).filter(a =>
      ['patch_apply', 'suggest_patch'].includes(a.action_type)
    ).length;

    return [
      { icon: Bug, label: 'Programas Suspeitos Encerrados', count: processesKilled, color: 'text-red-500', bgColor: 'bg-red-500/10' },
      { icon: Shield, label: 'Ameaças Bloqueadas', count: threatsPrevented, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
      { icon: Activity, label: 'Comportamentos Anormais Isolados', count: anomaliesIsolated, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
      { icon: Cpu, label: 'Serviços Restaurados', count: servicesRestarted, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
      { icon: Wifi, label: 'Computadores Recuperados', count: agentsRecovered, color: 'text-green-500', bgColor: 'bg-green-500/10' },
      { icon: FileWarning, label: 'Atualizações Sugeridas', count: patchesSuggested, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
    ];
  }, [remediationActions, automationExecs, playbookExecs]);

  // Calculate estimated financial impact avoided
  const financialImpact = useMemo(() => {
    let total = 0;
    (remediationActions || []).forEach(action => {
      const cost = INCIDENT_COST_MAP[action.action_type] || 500;
      if (action.status !== 'failed') total += cost;
    });
    (playbookExecs || []).filter(e => e.auto_executed).forEach(() => {
      total += 2000; // avg playbook value
    });
    return total;
  }, [remediationActions, playbookExecs]);

  const totalActionsToday = (remediationActions || []).length + 
    (automationExecs || []).length + 
    (playbookExecs || []).filter(e => e.auto_executed).length;

  const successRate = totalActionsToday > 0
    ? Math.round(((remediationActions || []).filter(a => a.status !== 'failed').length / 
      Math.max((remediationActions || []).length, 1)) * 100)
    : 100;

  // Recent action timeline
  const recentActions = useMemo(() => {
    const all = [
      ...(remediationActions || []).map(a => ({
        id: a.id,
        type: a.action_type,
        agent: a.agent_name || 'N/A',
        source: a.trigger_source,
        status: a.status,
        time: a.created_at,
      })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
    return all;
  }, [remediationActions]);

  const ACTION_ICONS: Record<string, string> = {
    kill_process: '🔪',
    firewall_block: '🧱',
    quarantine_file: '🔒',
    restart_service: '🔄',
    patch_apply: '🩹',
    enable_antivirus: '🛡️',
    enable_firewall: '🔥',
    block_usb_device: '🔌',
    suggest_patch: '📋',
    disk_cleanup: '💿',
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              O que foi protegido hoje
            </CardTitle>
            <CardDescription className="text-xs">
              Ações automáticas realizadas nos seus computadores
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            <ShieldCheck className="h-3 w-3 mr-1 text-green-500" />
            {totalActionsToday} ações
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Impact Metrics Grid */}
        <div className="grid grid-cols-3 gap-2">
          {impactMetrics.map((metric, idx) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={cn("p-2 rounded-lg text-center", metric.bgColor)}
            >
              <metric.icon className={cn("h-4 w-4 mx-auto mb-1", metric.color)} />
              <p className="text-lg font-bold">{metric.count}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{metric.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Financial Impact */}
        <div className="p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Impacto Financeiro Evitado (est.)</p>
                <p className="text-lg font-bold text-green-600">
                  R$ {financialImpact.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
              <p className="text-sm font-bold text-green-600">{successRate}%</p>
            </div>
          </div>
        </div>

        {/* Auto-Improvement Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Score de Melhoria Automática
            </span>
            <span className="font-medium">
              {totalActionsToday > 0 ? '+' : ''}{totalActionsToday} vs média {weeklyStats?.avgDaily || 0}/dia
            </span>
          </div>
          <Progress 
            value={Math.min(successRate, 100)} 
            className="h-2"
          />
        </div>

        {/* Recent Actions Timeline */}
        {recentActions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Últimas Ações</p>
            <ScrollArea className="h-[160px]">
              <div className="space-y-1.5">
                {recentActions.map((action) => (
                  <div 
                    key={action.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span>{ACTION_ICONS[action.type] || '⚙️'}</span>
                      <div>
                        <span className="font-medium">{action.type.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground ml-1">• {action.agent}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {action.status === 'failed' ? (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      ) : (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      )}
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(action.time), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
