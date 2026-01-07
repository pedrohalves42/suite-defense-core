import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/useTenant';
import { 
  Shield, Server, AlertTriangle, CheckCircle, WifiOff, 
  ArrowRight, Brain, Bug, ShieldAlert, ChevronRight,
  Lightbulb
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { getAgentStatusInfo } from '@/lib/agent-utils';
import { toast } from 'sonner';
import { ProtectionTrendChart } from '@/components/admin/ProtectionTrendChart';
import { GovernanceHealthBanner } from '@/components/admin/GovernanceHealthBanner';
import { NotificationSetupBanner } from '@/components/admin/NotificationSetupBanner';
import { OnboardingRequiredBanner } from '@/components/admin/OnboardingRequiredBanner';
import { RBACMetricsCard } from '@/components/admin/RBACMetricsCard';
import { SafeModeCounter } from '@/components/admin/SafeModeCounter';
import { GapsSummaryCard } from '@/components/admin/GapsSummaryCard';
import { SystemCyclesHealthCard } from '@/components/admin/SystemCyclesHealthCard';
import { CompactAlert } from '@/components/ui/explainable-alert';
import { getAlertExplanation } from '@/lib/leigo-translator';
import { SectionDivider } from '@/components/ui/section-divider';

export default function Dashboard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  // Fetch agents - only when tenant is loaded
  const { data: agents, isLoading: agentsLoading, isFetched: agentsFetched } = useQuery({
    queryKey: ['dashboard-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, status, last_heartbeat')
        .eq('tenant_id', tenant.id)
        .is('archived_at', null);
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

  // Calculate stats - só calcula quando dados estão carregados
  const hasAgentData = agentsFetched && agents && agents.length > 0;
  const onlineAgents = hasAgentData ? agents.filter(a => getAgentStatusInfo(a).isOnline).length : 0;
  const offlineAgents = hasAgentData ? agents.length - onlineAgents : 0;
  const criticalAlerts = alerts?.filter(a => a.severity === 'critical' || a.severity === 'high').length || 0;

  // Calculate security score (0-100) - Simplified without jobsStats
  const calculateSecurityScore = () => {
    let score = 100;
    score -= Math.min(offlineAgents * 5, 25);
    score -= Math.min(criticalAlerts * 10, 30);
    score -= Math.min((vulnStats?.critical || 0) * 5, 25);
    return Math.max(0, score);
  };

  const securityScore = calculateSecurityScore();

  // Get global status
  const getGlobalStatus = () => {
    if (securityScore >= 80 && criticalAlerts === 0) {
      return {
        emoji: '🟢',
        title: 'Tudo sob controle',
        description: 'Seus computadores estão protegidos. Continue trabalhando tranquilo.',
        variant: 'success' as const
      };
    }
    if (securityScore >= 60 || criticalAlerts <= 2) {
      return {
        emoji: '🟡',
        title: 'Atenção necessária',
        description: 'Alguns computadores precisam de verificação.',
        variant: 'warning' as const
      };
    }
    return {
      emoji: '🔴',
      title: 'Ação urgente',
      description: 'Existe risco que pode impactar sua operação.',
      variant: 'danger' as const
    };
  };

  const globalStatus = getGlobalStatus();

  // Map problem type to alert type
  const mapProblemToAlertType = (priority: 'high' | 'medium' | 'low', problemKey: string): string => {
    if (problemKey === 'criticalAlerts') return 'security_threat';
    if (problemKey === 'offlineAgents') return 'agents_offline';
    if (problemKey === 'vulnCritical') return 'vulnerability_critical';
    if (problemKey === 'aiInsights') return 'ai_insights_pending';
    return 'security_threat';
  };

  // Build problems list with fear/consequence format
  const problems: Array<{
    icon: typeof AlertTriangle;
    problem: string;
    consequence: string;
    to: string;
    priority: 'high' | 'medium' | 'low';
    alertType: string;
  }> = [];
  
  if (criticalAlerts > 0) {
    problems.push({
      icon: AlertTriangle,
      problem: `${criticalAlerts} alerta${criticalAlerts > 1 ? 's' : ''} crítico${criticalAlerts > 1 ? 's' : ''} ativo${criticalAlerts > 1 ? 's' : ''}`,
      consequence: 'Podem indicar ameaças ativas no sistema',
      to: '/admin/security-monitoring',
      priority: 'high' as const,
      alertType: 'security_threat',
    });
  }
  
  if (offlineAgents > 0) {
    problems.push({
      icon: WifiOff,
      problem: `${offlineAgents} computador${offlineAgents > 1 ? 'es estão' : ' está'} desligado${offlineAgents > 1 ? 's' : ''}`,
      consequence: 'Podem não receber atualizações de segurança',
      to: '/admin/agent-health',
      priority: 'medium' as const,
      alertType: 'agents_offline',
    });
  }
  
  if ((vulnStats?.critical || 0) > 0) {
    problems.push({
      icon: Bug,
      problem: `${vulnStats?.critical} vulnerabilidade${(vulnStats?.critical || 0) > 1 ? 's' : ''} crítica${(vulnStats?.critical || 0) > 1 ? 's' : ''} encontrada${(vulnStats?.critical || 0) > 1 ? 's' : ''}`,
      consequence: 'Podem ser exploradas por atacantes',
      to: '/admin/vulnerabilities',
      priority: 'high' as const,
      alertType: 'vulnerability_critical',
    });
  }
  
  if ((insightsCount || 0) > 0) {
    problems.push({
      icon: Brain,
      problem: `${insightsCount} insight${(insightsCount || 0) > 1 ? 's' : ''} da IA aguardando`,
      consequence: 'Recomendações para melhorar sua proteção',
      to: '/admin/ai-insights',
      priority: 'low' as const,
      alertType: 'ai_insights_pending',
    });
  }

  // Loading state: aguarda tenant E dados carregarem
  if (!tenant?.id || agentsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header-enterprise">
        <h1>Painel Principal</h1>
        <p>Visão geral da proteção dos seus computadores</p>
      </div>

      {/* 🚀 ONBOARDING BANNER - Setup inicial obrigatório */}
      <OnboardingRequiredBanner />

      {/* 🔔 NOTIFICATION SETUP BANNER */}
      <NotificationSetupBanner />

      {/* 🔐 GOVERNANCE HEALTH BANNER - MFA Enforcement + Metrics */}
      <GovernanceHealthBanner />

      {/* 📊 GAPS SUMMARY - Ciclos e pendências do sistema */}
      <GapsSummaryCard />

      {/* 🔄 CYCLES HEALTH - Saúde dos ciclos operacionais */}
      <SystemCyclesHealthCard />

      {/* Divisor visual entre seções */}
      <SectionDivider label="Status de Proteção" />

      {/* 🔐 CARD PRINCIPAL DE STATUS - Responde "Estou protegido?" em 3 segundos */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn(
          "border-2",
          globalStatus.variant === 'success' && "bg-green-500/5 border-green-500/30",
          globalStatus.variant === 'warning' && "bg-amber-500/5 border-amber-500/30",
          globalStatus.variant === 'danger' && "bg-red-500/5 border-red-500/30"
        )}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-full",
                globalStatus.variant === 'success' && "bg-green-500/10",
                globalStatus.variant === 'warning' && "bg-amber-500/10",
                globalStatus.variant === 'danger' && "bg-red-500/10"
              )}>
                <Shield className={cn(
                  "h-10 w-10",
                  globalStatus.variant === 'success' && "text-green-500",
                  globalStatus.variant === 'warning' && "text-amber-500",
                  globalStatus.variant === 'danger' && "text-red-500"
                )} />
              </div>
              <div className="flex-1">
                <h2 className={cn(
                  "text-xl font-bold",
                  globalStatus.variant === 'success' && "text-green-600 dark:text-green-400",
                  globalStatus.variant === 'warning' && "text-amber-600 dark:text-amber-400",
                  globalStatus.variant === 'danger' && "text-red-600 dark:text-red-400"
                )}>
                  {globalStatus.emoji} {globalStatus.title}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {globalStatus.description}
                </p>
              </div>
              <div className="text-right">
                <div className={cn(
                  "text-3xl font-bold",
                  securityScore >= 80 && "text-green-600",
                  securityScore >= 60 && securityScore < 80 && "text-amber-600",
                  securityScore < 60 && "text-red-600"
                )}>
                  {securityScore}%
                </div>
                <div className="text-xs text-muted-foreground">Nível de proteção</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 📈 CAMADA 3: Gráfico de Tendência */}
      <ProtectionTrendChart />

      {/* Critical Alert Action (if any) */}
      {criticalAlerts > 0 && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive font-medium">
                  {criticalAlerts} alerta{criticalAlerts > 1 ? 's' : ''} crítico{criticalAlerts > 1 ? 's' : ''} aguardando ação
                </span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={acknowledgeAllMutation.isPending}
              >
                Reconhecer
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Divisor visual */}
      <SectionDivider label="Alertas e Resumo" />

      {/* 2️⃣ Main Grid: Problems + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* O que pode virar problema */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                O que pode virar problema se você ignorar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {problems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle className="h-14 w-14 text-green-500 mb-4" />
                  <p className="text-lg font-medium text-foreground">🎉 Nada para se preocupar!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Todos os seus computadores estão protegidos
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {problems.slice(0, 3).map((item, idx) => (
                    <CompactAlert
                      key={idx}
                      type={item.alertType}
                      severity={item.priority === 'high' ? 'error' : item.priority === 'medium' ? 'warning' : 'info'}
                      onClick={() => navigate(item.to)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                Resumo rápido
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Computadores */}
              <Link to="/admin/agent-health" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Computadores</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-green-600">{onlineAgents}</span>
                  <span className="text-sm text-muted-foreground">online</span>
                  {offlineAgents > 0 && (
                    <span className="text-sm text-red-500">• {offlineAgents} offline</span>
                  )}
                </div>
              </Link>

              {/* Alertas */}
              <Link to="/admin/security-monitoring" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Alertas</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn("text-lg font-bold", (alerts?.length || 0) > 0 ? "text-yellow-600" : "text-green-600")}>
                    {alerts?.length || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">ativos</span>
                  {criticalAlerts > 0 && (
                    <span className="text-sm text-red-500">• {criticalAlerts} críticos</span>
                  )}
                </div>
              </Link>

              {/* Vulnerabilidades */}
              <Link to="/admin/vulnerabilities" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Riscos detectados</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn("text-xl font-bold", (vulnStats?.critical || 0) > 0 ? "text-orange-600" : "text-green-600")}>
                    {vulnStats?.total || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">total</span>
                  {(vulnStats?.critical || 0) > 0 && (
                    <span className="text-sm text-orange-500">• {vulnStats?.critical} críticos</span>
                  )}
                </div>
              </Link>

              {/* Avisos da IA */}
              <Link to="/admin/ai-insights" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Avisos da IA</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn("text-lg font-bold", (insightsCount || 0) > 0 ? "text-blue-600" : "text-green-600")}>
                    {insightsCount || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">pendentes</span>
                </div>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 🛡️ RBAC Metrics + Safe Mode Counter */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RBACMetricsCard />
        <SafeModeCounter />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
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

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
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

      {/* 4️⃣ ÂNCORA DE SEGURO OPERACIONAL */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="py-4 flex items-center justify-center gap-3 text-center">
            <Lightbulb className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              O CyberShield monitora seus computadores automaticamente. 
              <span className="font-medium text-foreground"> Se algo crítico acontecer, você será avisado.</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <OnboardingWizard open={showOnboarding} onComplete={() => setShowOnboarding(false)} />
    </div>
  );
}
