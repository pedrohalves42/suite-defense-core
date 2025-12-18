import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/useTenant';
import { 
  Shield, Server, AlertTriangle, CheckCircle, Wifi, WifiOff, 
  ArrowRight, Brain, Activity, Bug, ShieldAlert, ChevronRight,
  TrendingUp, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { getAgentStatusInfo } from '@/lib/agent-utils';
import { toast } from 'sonner';

export default function Dashboard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const onboardingParam = searchParams.get('onboarding');
    if (onboardingParam === 'true') {
      setShowOnboarding(true);
      searchParams.delete('onboarding');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch agents
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['dashboard-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, status, last_heartbeat')
        .eq('tenant_id', tenant.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Fetch alerts
  const { data: alerts } = useQuery({
    queryKey: ['dashboard-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('system_alerts')
        .select('id, severity, message, alert_type')
        .eq('tenant_id', tenant.id)
        .eq('resolved', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Fetch vulnerabilities
  const { data: vulnStats } = useQuery({
    queryKey: ['dashboard-vulns', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, critical: 0 };
      const { data, error } = await supabase
        .from('vuln_findings')
        .select('severity')
        .eq('tenant_id', tenant.id);
      if (error) throw error;
      const total = data?.length || 0;
      const critical = data?.filter(v => v.severity === 'critical' || v.severity === 'high').length || 0;
      return { total, critical };
    },
    enabled: !!tenant?.id,
  });

  // Fetch jobs stats
  const { data: jobsStats } = useQuery({
    queryKey: ['dashboard-jobs-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, success: 0, rate: 0 };
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('jobs_normalized')
        .select('normalized_status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', oneDayAgo);
      if (error) throw error;
      const total = data?.length || 0;
      const success = data?.filter(j => j.normalized_status === 'completed').length || 0;
      const rate = total > 0 ? Math.round((success / total) * 100) : 100;
      return { total, success, rate };
    },
    enabled: !!tenant?.id,
  });

  // Fetch AI insights count
  const { data: insightsCount } = useQuery({
    queryKey: ['dashboard-insights', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const { count, error } = await supabase
        .from('ai_insights')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('acknowledged', false);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!tenant?.id,
  });

  // Acknowledge alerts mutation
  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      const { data, error } = await supabase.rpc('acknowledge_all_alerts', {
        p_tenant_id: tenant.id
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Alertas reconhecidos');
      queryClient.invalidateQueries({ queryKey: ['dashboard-alerts'] });
    },
  });

  // Calculate stats
  const onlineAgents = agents?.filter(a => getAgentStatusInfo(a).isOnline).length || 0;
  const offlineAgents = (agents?.length || 0) - onlineAgents;
  const criticalAlerts = alerts?.filter(a => a.severity === 'critical' || a.severity === 'high').length || 0;

  // Calculate security score (0-100)
  const calculateSecurityScore = () => {
    let score = 100;
    
    // Penalize for offline agents (-5 each, max -25)
    score -= Math.min(offlineAgents * 5, 25);
    
    // Penalize for critical alerts (-10 each, max -30)
    score -= Math.min(criticalAlerts * 10, 30);
    
    // Penalize for critical vulnerabilities (-5 each, max -25)
    score -= Math.min((vulnStats?.critical || 0) * 5, 25);
    
    // Penalize for low job success rate
    if (jobsStats?.rate && jobsStats.rate < 90) {
      score -= 20;
    } else if (jobsStats?.rate && jobsStats.rate < 95) {
      score -= 10;
    }
    
    return Math.max(0, score);
  };

  const securityScore = calculateSecurityScore();

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excelente';
    if (score >= 60) return 'Atenção';
    return 'Crítico';
  };

  // Build next actions list
  const nextActions = [];
  if (criticalAlerts > 0) {
    nextActions.push({
      icon: AlertTriangle,
      label: `Verificar ${criticalAlerts} alerta${criticalAlerts > 1 ? 's' : ''} crítico${criticalAlerts > 1 ? 's' : ''}`,
      to: '/admin/security-monitoring',
      priority: 'high'
    });
  }
  if (offlineAgents > 0) {
    nextActions.push({
      icon: WifiOff,
      label: `${offlineAgents} computador${offlineAgents > 1 ? 'es' : ''} offline`,
      to: '/admin/agent-health',
      priority: 'medium'
    });
  }
  if ((vulnStats?.critical || 0) > 0) {
    nextActions.push({
      icon: Bug,
      label: `Revisar ${vulnStats?.critical} vulnerabilidade${(vulnStats?.critical || 0) > 1 ? 's' : ''} crítica${(vulnStats?.critical || 0) > 1 ? 's' : ''}`,
      to: '/admin/vulnerabilities',
      priority: 'high'
    });
  }
  if ((insightsCount || 0) > 0) {
    nextActions.push({
      icon: Brain,
      label: `${insightsCount} insight${(insightsCount || 0) > 1 ? 's' : ''} da IA pendente${(insightsCount || 0) > 1 ? 's' : ''}`,
      to: '/admin/ai-insights',
      priority: 'low'
    });
  }

  if (agentsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Painel Principal</h1>
        <p className="text-muted-foreground text-sm">Como está a proteção dos seus computadores</p>
      </div>

      {/* Contextual Message */}
      {securityScore >= 80 && criticalAlerts === 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-green-700 dark:text-green-400 font-medium">
                Tudo certo! Seus computadores estão protegidos.
              </span>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {criticalAlerts > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-destructive font-medium">
                  {criticalAlerts} alerta{criticalAlerts > 1 ? 's' : ''} crítico{criticalAlerts > 1 ? 's' : ''} requer{criticalAlerts > 1 ? 'em' : ''} atenção
                </span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={acknowledgeAllMutation.isPending}
              >
                Reconhecer
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main Grid: Score + Next Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Security Score */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Nível de Proteção
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-6">
              <div className="relative">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted/20"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(securityScore / 100) * 352} 352`}
                    strokeLinecap="round"
                    className={getScoreColor(securityScore)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-4xl font-bold", getScoreColor(securityScore))}>
                    {securityScore}
                  </span>
                  <span className="text-xs text-muted-foreground">de 100</span>
                </div>
              </div>
              <p className={cn("mt-4 font-medium", getScoreColor(securityScore))}>
                {securityScore >= 80 ? '✓ Bem protegido' : securityScore >= 60 ? '⚠️ Atenção necessária' : '🚨 Ação urgente'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Next Actions */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                O que fazer agora
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nextActions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
                  <p className="font-medium text-foreground">🎉 Nada para fazer!</p>
                  <p className="text-sm text-muted-foreground">Seus computadores estão bem protegidos</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {nextActions.slice(0, 4).map((action, idx) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        key={idx}
                        to={action.to}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg transition-colors",
                          action.priority === 'high' 
                            ? "bg-destructive/10 hover:bg-destructive/15" 
                            : "bg-muted/50 hover:bg-muted"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={cn(
                            "h-4 w-4",
                            action.priority === 'high' ? "text-destructive" : "text-muted-foreground"
                          )} />
                          <span className="text-sm">{action.label}</span>
                        </div>
                        <Button variant="ghost" size="sm">
                          Ver <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Link to="/admin/agent-health">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-green-600">{onlineAgents}</span>
                    <span className="text-sm text-muted-foreground">online</span>
                  </div>
                  {offlineAgents > 0 && (
                    <p className="text-xs text-red-500 mt-1">{offlineAgents} offline</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Computadores</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Link to="/admin/security-monitoring">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl font-bold", criticalAlerts > 0 ? "text-red-600" : "text-green-600")}>
                      {alerts?.length || 0}
                    </span>
                    <span className="text-sm text-muted-foreground">ativos</span>
                  </div>
                  {criticalAlerts > 0 && (
                    <p className="text-xs text-red-500 mt-1">{criticalAlerts} críticos</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Alertas</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Link to="/admin/vulnerabilities">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <Bug className="h-5 w-5 text-muted-foreground" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl font-bold", (vulnStats?.critical || 0) > 0 ? "text-orange-600" : "text-green-600")}>
                      {vulnStats?.total || 0}
                    </span>
                    <span className="text-sm text-muted-foreground">detectadas</span>
                  </div>
                  {(vulnStats?.critical || 0) > 0 && (
                    <p className="text-xs text-orange-500 mt-1">{vulnStats?.critical} críticas</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Vulnerabilidades</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-2xl font-bold", (jobsStats?.rate || 100) >= 90 ? "text-green-600" : "text-orange-600")}>
                    {jobsStats?.rate || 100}%
                  </span>
                  <span className="text-sm text-muted-foreground">sucesso</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{jobsStats?.total || 0} tarefas hoje</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Taxa de Sucesso</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Link to="/admin/ai-insights">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Brain className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Insights da IA</p>
                    <p className="text-sm text-muted-foreground">
                      {insightsCount || 0} pendente{(insightsCount || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Link to="/admin/reports">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Relatórios de Segurança</p>
                    <p className="text-sm text-muted-foreground">Visualizar laudos</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </div>

      <OnboardingWizard open={showOnboarding} onComplete={() => setShowOnboarding(false)} />
    </div>
  );
}
