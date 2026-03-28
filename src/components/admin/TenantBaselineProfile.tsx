/**
 * Tenant Baseline Profile Card
 * Shows company-wide behavioral baselines with drift detection
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3, Cpu, Clock, AppWindow, AlertTriangle,
  CheckCircle, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BaselineProfile {
  type: string;
  mean: number;
  stdDev: number;
  currentAvg: number | null;
  driftPercent: number;
  status: 'normal' | 'warning' | 'critical';
  unit: string;
  label: string;
}

export function TenantBaselineProfile() {
  const { tenant } = useTenant();

  // Fetch baselines for all agents
  const { data: baselines } = useQuery({
    queryKey: ['tenant-baselines', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('agent_behavioral_baseline')
        .select('baseline_type, mean_value, std_deviation, threshold_multiplier, baseline_data, last_updated')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false, // COST-OPT: 60s → 5min
  });

  // Fetch current metrics for comparison
  const { data: currentMetrics } = useQuery({
    queryKey: ['tenant-current-metrics', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      // Get latest system metrics across all agents
      const [metricsRes, procRes] = await Promise.all([
        supabase
          .from('agent_system_metrics_partitioned')
          .select('agent_id, cpu_usage_percent, memory_usage_percent, collected_at')
          .eq('tenant_id', tenant.id)
          .gte('collected_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .order('collected_at', { ascending: false })
          .limit(200),
        supabase
          .from('agent_processes')
          .select('agent_id', { count: 'exact', head: false })
          .eq('tenant_id', tenant.id)
          .gte('collected_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1000),
      ]);
      
      const data = metricsRes.data;
      if (!data || data.length === 0) return null;

      const avgCpu = data.reduce((s: number, m: any) => s + (m.cpu_usage_percent || 0), 0) / data.length;
      const avgMem = data.reduce((s: number, m: any) => s + (m.memory_usage_percent || 0), 0) / data.length;

      // Calculate avg processes per agent
      const procData = procRes.data || [];
      const agentProcCounts = new Map<string, number>();
      procData.forEach((p: Record<string, unknown>) => {
        agentProcCounts.set(String(p.agent_id), (agentProcCounts.get(String(p.agent_id)) || 0) + 1);
      });
      const avgProcs = agentProcCounts.size > 0
        ? Math.round(Array.from(agentProcCounts.values()).reduce((s, c) => s + c, 0) / agentProcCounts.size)
        : null;

      return {
        avgCpu: Math.round(avgCpu * 10) / 10,
        avgMem: Math.round(avgMem * 10) / 10,
        avgProcs,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });

  // Fetch active hours pattern
  const { data: activeHoursPattern } = useQuery({
    queryKey: ['tenant-active-hours', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('collected_at')
        .eq('tenant_id', tenant.id)
        .gte('collected_at', weekAgo.toISOString())
        .limit(500);
      
      if (error || !data) return null;

      const hourCounts = new Array(24).fill(0);
      (data as Array<{ collected_at: string }>).forEach((m) => {
        const hour = new Date(m.collected_at).getHours();
        hourCounts[hour]++;
      });

      const maxCount = Math.max(...hourCounts);
      const activeHours = hourCounts
        .map((count, hour) => ({ hour, count, active: count > maxCount * 0.3 }))
        .filter(h => h.active)
        .map(h => h.hour);

      const peakStart = Math.min(...activeHours);
      const peakEnd = Math.max(...activeHours);

      return { peakStart, peakEnd, hourCounts, maxCount };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });

  const profiles: BaselineProfile[] = useMemo(() => {
    if (!baselines || baselines.length === 0) return [];

    const cpuBaselines = baselines.filter(b => b.baseline_type === 'cpu_usage');
    const memBaselines = baselines.filter(b => b.baseline_type === 'memory_usage');
    const procBaselines = baselines.filter(b => b.baseline_type === 'process_count');

    const result: BaselineProfile[] = [];

    // For CPU/RAM (percentage metrics), use absolute difference in percentage points
    // This avoids misleading +1380% when baseline is 1% and current is 15%
    if (cpuBaselines.length > 0) {
      const avgMean = cpuBaselines.reduce((s, b) => s + (b.mean_value || 0), 0) / cpuBaselines.length;
      const avgStd = cpuBaselines.reduce((s, b) => s + (b.std_deviation || 0), 0) / cpuBaselines.length;
      const currentVal = currentMetrics?.avgCpu ?? null;
      // Use absolute difference in percentage points for CPU/RAM
      const absDiff = currentVal !== null ? currentVal - avgMean : 0;
      const drift = Math.round(absDiff);
      
      result.push({
        type: 'cpu',
        mean: Math.round(avgMean * 10) / 10,
        stdDev: Math.round(avgStd * 10) / 10,
        currentAvg: currentVal,
        driftPercent: drift,
        status: Math.abs(absDiff) > 20 ? 'critical' : Math.abs(absDiff) > 10 ? 'warning' : 'normal',
        unit: '%',
        label: 'CPU Médio por Empresa',
      });
    }

    if (memBaselines.length > 0) {
      const avgMean = memBaselines.reduce((s, b) => s + (b.mean_value || 0), 0) / memBaselines.length;
      const avgStd = memBaselines.reduce((s, b) => s + (b.std_deviation || 0), 0) / memBaselines.length;
      const currentVal = currentMetrics?.avgMem ?? null;
      const absDiff = currentVal !== null ? currentVal - avgMean : 0;
      const drift = Math.round(absDiff);

      result.push({
        type: 'memory',
        mean: Math.round(avgMean * 10) / 10,
        stdDev: Math.round(avgStd * 10) / 10,
        currentAvg: currentVal,
        driftPercent: drift,
        status: Math.abs(absDiff) > 20 ? 'critical' : Math.abs(absDiff) > 10 ? 'warning' : 'normal',
        unit: '%',
        label: 'Memória Média por Empresa',
      });
    }

    if (procBaselines.length > 0) {
      const avgMean = procBaselines.reduce((s, b) => s + (b.mean_value || 0), 0) / procBaselines.length;
      const currentVal = currentMetrics?.avgProcs ?? null;
      const absDiff = currentVal !== null ? currentVal - Math.round(avgMean) : 0;
      result.push({
        type: 'processes',
        mean: Math.round(avgMean),
        stdDev: 0,
        currentAvg: currentVal,
        driftPercent: absDiff,
        status: Math.abs(absDiff) > 50 ? 'warning' : 'normal',
        unit: '',
        label: 'Processos Médios por Agente',
      });
    }

    return result;
  }, [baselines, currentMetrics]);

  const getDriftIcon = (drift: number) => {
    if (drift > 10) return <TrendingUp className="h-3 w-3 text-red-500" />;
    if (drift < -10) return <TrendingDown className="h-3 w-3 text-blue-500" />;
    return <Minus className="h-3 w-3 text-green-500" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'border-red-500/50 bg-red-500/5';
      case 'warning': return 'border-amber-500/50 bg-amber-500/5';
      default: return 'border-green-500/50 bg-green-500/5';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Perfil de Uso da Empresa
        </CardTitle>
        <CardDescription className="text-xs">
          Comparação entre o uso normal e o uso atual dos computadores
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {profiles.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Coletando dados de uso...</p>
          </div>
        ) : (
          <>
            {/* Baseline Profiles */}
            <div className="space-y-3">
              {profiles.map((profile, idx) => (
                <motion.div
                  key={profile.type}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={cn("p-3 rounded-lg border", getStatusColor(profile.status))}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {profile.type === 'cpu' && <Cpu className="h-4 w-4 text-blue-500" />}
                      {profile.type === 'memory' && <BarChart3 className="h-4 w-4 text-purple-500" />}
                      {profile.type === 'processes' && <AppWindow className="h-4 w-4 text-green-500" />}
                      <span className="text-xs font-medium">{profile.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {getDriftIcon(profile.driftPercent)}
                      <Badge 
                        variant={profile.status === 'normal' ? 'secondary' : 'destructive'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {profile.status === 'normal' ? 'Normal' : 
                         profile.status === 'warning' ? 'Desvio' : 'Alerta'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{profile.mean}{profile.unit}</p>
                      <p className="text-[10px] text-muted-foreground">Normal</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {profile.currentAvg !== null ? `${profile.currentAvg}${profile.unit}` : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Atual</p>
                    </div>
                    <div>
                      <p className={cn("text-lg font-bold", 
                        profile.driftPercent > 0 ? 'text-red-500' : 
                        profile.driftPercent < 0 ? 'text-blue-500' : 'text-green-500'
                      )}>
                        {profile.driftPercent > 0 ? '+' : ''}{profile.driftPercent}{profile.unit ? 'pp' : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Variação</p>
                    </div>
                  </div>

                  {profile.currentAvg !== null && (
                    <Progress 
                      value={Math.min(profile.currentAvg, 100)} 
                      className="h-1.5 mt-2" 
                    />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Operating Hours */}
            {activeHoursPattern && (
              <div className="p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Horário Típico de Operação</span>
                </div>
                <div className="flex gap-0.5">
                  {activeHoursPattern.hourCounts.map((count, hour) => {
                    const intensity = activeHoursPattern.maxCount > 0 
                      ? count / activeHoursPattern.maxCount 
                      : 0;
                    return (
                      <div
                        key={hour}
                        className="flex-1 rounded-sm transition-colors"
                        style={{
                          height: '24px',
                          backgroundColor: intensity > 0.7 
                            ? 'hsl(var(--primary) / 0.8)' 
                            : intensity > 0.3 
                            ? 'hsl(var(--primary) / 0.4)' 
                            : 'hsl(var(--muted))',
                        }}
                        title={`${hour}h: ${count} registros`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0h</span>
                  <span>Pico: {activeHoursPattern.peakStart}h-{activeHoursPattern.peakEnd}h</span>
                  <span>23h</span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
