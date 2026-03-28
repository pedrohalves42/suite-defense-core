import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertTriangle, 
  Lightbulb, 
  WifiOff, 
  Activity,
  Shield,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRiskScore } from '@/hooks/useRiskScore';
import { useLatestConfidenceGap } from '@/hooks/useConfidenceGap';
import { useTenant } from '@/hooks/useTenant';

interface GapItem {
  label: string;
  count: number;
  status: 'critical' | 'warning' | 'ok';
  link: string;
  icon: React.ElementType;
}

export function GapsSummaryCard() {
  const { tenant } = useTenant();
  const { riskScore, isLoading: riskLoading } = useRiskScore();
  const { data: confidenceGap, isLoading: confidenceLoading } = useLatestConfidenceGap();

  // Fetch critical alerts count (last 7 days, filtered by tenant)
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['gaps-critical-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('system_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('resolved', false)
        .in('severity', ['high', 'critical'])
        .gte('created_at', sevenDaysAgo);
      return count || 0;
    },
    enabled: !!tenant?.id,
    staleTime: 60000,
  });

  // Fetch untriaged insights count (filtered by tenant)
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['gaps-untriaged-insights', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const { count } = await supabase
        .from('ai_insights')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('acknowledged', false)
        .in('severity', ['high', 'critical']);
      return count || 0;
    },
    enabled: !!tenant?.id,
    staleTime: 60000,
  });

  // Fetch offline agents count (filtered by tenant)
  const { data: offlineData, isLoading: offlineLoading } = useQuery({
    queryKey: ['gaps-offline-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      const agents = (agentsRaw as any as Array<{ last_heartbeat: string | null }>) || [];
      return agents.filter(a => a.last_heartbeat && a.last_heartbeat < threshold).length;
    },
    enabled: !!tenant?.id,
    staleTime: 60000,
  });

  // Fetch failed jobs in last 24h (filtered by tenant)
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['gaps-failed-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('scheduled_job_runs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('success', false)
        .gte('started_at', threshold);
      return count || 0;
    },
    enabled: !!tenant?.id,
    staleTime: 60000,
  });

  const isLoading = alertsLoading || insightsLoading || offlineLoading || jobsLoading || riskLoading || confidenceLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const gaps: GapItem[] = [
    {
      label: 'Alertas Críticos (7d)',
      count: alertsData || 0,
      status: (alertsData || 0) > 0 ? 'critical' : 'ok',
      link: '/admin/alert-resolution',
      icon: AlertTriangle,
    },
    {
      label: 'Insights Não Triados',
      count: insightsData || 0,
      status: (insightsData || 0) > 5 ? 'critical' : (insightsData || 0) > 0 ? 'warning' : 'ok',
      link: '/admin/insight-triage',
      icon: Lightbulb,
    },
    {
      label: 'Agentes Offline',
      count: offlineData || 0,
      status: (offlineData || 0) > 2 ? 'critical' : (offlineData || 0) > 0 ? 'warning' : 'ok',
      link: '/admin/agents',
      icon: WifiOff,
    },
    {
      label: 'Jobs Falhos (24h)',
      count: jobsData || 0,
      status: (jobsData || 0) > 5 ? 'critical' : (jobsData || 0) > 0 ? 'warning' : 'ok',
      link: '/admin/job-health',
      icon: Clock,
    },
  ];

  // Add confidence gap status
  const confidenceStatus = confidenceGap?.health_status || 'unknown';
  const confidenceValue = confidenceGap 
    ? Math.abs((confidenceGap.red_score || 0) - (confidenceGap.ana_score || 0))
    : null;

  // Add risk score status
  const riskStatus = riskScore 
    ? riskScore.score >= 80 ? 'ok' : riskScore.score >= 60 ? 'warning' : 'critical'
    : 'warning';

  const totalCritical = gaps.filter(g => g.status === 'critical').length;
  const totalWarning = gaps.filter(g => g.status === 'warning').length;
  const allOk = totalCritical === 0 && totalWarning === 0;

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(
        "border-2 transition-colors",
        totalCritical > 0 && "border-destructive/50 bg-destructive/5",
        totalCritical === 0 && totalWarning > 0 && "border-warning/50 bg-warning/5",
        allOk && "border-success/50 bg-success/5"
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Gaps e Ciclos Pendentes
            </CardTitle>
            {allOk ? (
              <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Tudo em dia
              </Badge>
            ) : (
              <Badge variant="outline" className={cn(
                totalCritical > 0 
                  ? "bg-destructive/20 text-destructive border-destructive/30"
                  : "bg-warning/20 text-warning border-warning/30"
              )}>
                <XCircle className="h-3 w-3 mr-1" />
                {totalCritical + totalWarning} pendências
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Gap Items */}
            {gaps.map((gap) => (
              <Link key={gap.label} to={gap.link}>
                <div className={cn(
                  "p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer",
                  gap.status === 'critical' && "bg-destructive/10 border-destructive/30 hover:bg-destructive/20",
                  gap.status === 'warning' && "bg-warning/10 border-warning/30 hover:bg-warning/20",
                  gap.status === 'ok' && "bg-muted/50 border-border hover:bg-muted"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <gap.icon className={cn(
                      "h-4 w-4",
                      gap.status === 'critical' && "text-destructive",
                      gap.status === 'warning' && "text-warning",
                      gap.status === 'ok' && "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-xl font-bold",
                      gap.status === 'critical' && "text-destructive",
                      gap.status === 'warning' && "text-warning",
                      gap.status === 'ok' && "text-muted-foreground"
                    )}>
                      {gap.count}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{gap.label}</p>
                </div>
              </Link>
            ))}

            {/* Confidence Gap */}
            <Link to="/admin/confidence-gap">
              <div className={cn(
                "p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer",
                confidenceStatus === 'critical' && "bg-destructive/10 border-destructive/30",
                confidenceStatus === 'attention' && "bg-warning/10 border-warning/30",
                confidenceStatus === 'healthy' && "bg-success/10 border-success/30",
                !['critical', 'attention', 'healthy'].includes(confidenceStatus) && "bg-muted/50 border-border"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className={cn(
                    "h-4 w-4",
                    confidenceStatus === 'critical' && "text-destructive",
                    confidenceStatus === 'attention' && "text-warning",
                    confidenceStatus === 'healthy' && "text-success"
                  )} />
                  <span className={cn(
                    "text-xl font-bold",
                    confidenceStatus === 'critical' && "text-destructive",
                    confidenceStatus === 'attention' && "text-warning",
                    confidenceStatus === 'healthy' && "text-success"
                  )}>
                    {confidenceValue !== null ? `${confidenceValue}%` : '—'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">Confidence Gap</p>
              </div>
            </Link>

            {/* Risk Score */}
            <Link to="/admin/risk-score">
              <div className={cn(
                "p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer",
                riskStatus === 'critical' && "bg-destructive/10 border-destructive/30",
                riskStatus === 'warning' && "bg-warning/10 border-warning/30",
                riskStatus === 'ok' && "bg-success/10 border-success/30"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className={cn(
                    "h-4 w-4",
                    riskStatus === 'critical' && "text-destructive",
                    riskStatus === 'warning' && "text-warning",
                    riskStatus === 'ok' && "text-success"
                  )} />
                  <span className={cn(
                    "text-xl font-bold",
                    riskStatus === 'critical' && "text-destructive",
                    riskStatus === 'warning' && "text-warning",
                    riskStatus === 'ok' && "text-success"
                  )}>
                    {riskScore?.score ?? '—'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">Risk Score</p>
              </div>
            </Link>
          </div>

          {/* Quick Actions */}
          {!allOk && (
            <div className="flex items-center justify-end mt-4 pt-3 border-t">
              <Link to="/admin/alert-resolution">
                <Button variant="outline" size="sm">
                  Resolver Pendências
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
