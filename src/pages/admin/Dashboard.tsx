import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Shield, Server, AlertTriangle, WifiOff, 
  Brain, Bug, ShieldAlert, ChevronRight, ChevronDown,
  Lightbulb, Activity, Wrench, BarChart3, Trophy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { toast } from 'sonner';
import { ProtectionTrendChartV2 } from '@/components/admin/ProtectionTrendChartV2';
import { HealthTrendChart } from '@/components/admin/HealthTrendChart';
import { SystemCyclesHealthCard } from '@/components/admin/SystemCyclesHealthCard';
import { ReleaseSignatureStatusCard } from '@/components/admin/ReleaseSignatureStatusCard';
import { GovernanceHealthBanner } from '@/components/admin/GovernanceHealthBanner';
import { SecurityAdvisorCard } from '@/components/admin/SecurityAdvisorCard';
import { NotificationSetupBanner } from '@/components/admin/NotificationSetupBanner';
import { OnboardingRequiredBanner } from '@/components/admin/OnboardingRequiredBanner';
import { PlanLimitBanner } from '@/components/PlanLimitBanner';
import { SimpleDashboard } from '@/components/dashboard/SimpleDashboard';
import { GuidedTour } from '@/components/admin/GuidedTour';
import { GamificationHub } from '@/components/gamification/GamificationHub';
import { XPLevelBar } from '@/components/gamification/XPLevelBar';
import { FleetHealthDashboard } from '@/components/fleet/FleetHealthDashboard';
import { useProactiveAlerts } from '@/hooks/useProactiveAlerts';
import { useSimpleModeContext } from '@/hooks/useSimpleMode';
import { useTranslation } from 'react-i18next';
import { useUnifiedMetrics } from '@/hooks/useUnifiedMetrics';
import { TenantRiskScore } from '@/components/dashboard/TenantRiskScore';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: 'easeOut' as const }
  })
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { metrics, isLoading: metricsLoading, tenant } = useUnifiedMetrics();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isSimple } = useSimpleModeContext();
  const [extrasOpen, setExtrasOpen] = useState(false);

  // Proactive real-time alerts
  useProactiveAlerts();

  useEffect(() => {
    const onboardingParam = searchParams.get('onboarding');
    if (onboardingParam === 'true') {
      setShowOnboarding(true);
      searchParams.delete('onboarding');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
      queryClient.invalidateQueries({ queryKey: ['unified-metrics'] });
    },
  });

  // Derive values from unified metrics
  const totalAgents = metrics?.agents.total || 0;
  const onlineAgents = metrics?.agents.online || 0;
  const offlineAgents = metrics?.agents.offline || 0;
  const criticalAlerts = metrics?.alerts.critical || 0;
  const securityScore = metrics?.securityScore || 100;
  const globalStatus = metrics?.globalStatus || { emoji: '🟢', title: t('adminPages.dashboard.allUnderControl'), description: t('adminPages.dashboard.allProtected'), variant: 'success' as const };
  const insightsCount = metrics?.insights.pending || 0;
  const vulnStats = metrics?.vulnerabilities || { total: 0, critical: 0 };

  // Stat cards data - PERF-FIX: Memoize static-ish data
  const statCards = useMemo(() => [
    {
      to: '/admin/agent-center',
      icon: Server,
      label: t('adminPages.dashboard.computers'),
      value: onlineAgents,
      suffix: `/ ${totalAgents}`,
      valueColor: 'text-success',
      alert: offlineAgents > 0 ? { icon: WifiOff, text: `${offlineAgents} ${t('adminPages.dashboard.offline')}`, color: 'text-warning' } : null,
    },
    {
      to: '/admin/security-monitoring',
      icon: ShieldAlert,
      label: t('adminPages.dashboard.alerts'),
      value: metrics?.alerts.active || 0,
      valueColor: criticalAlerts > 0 ? 'text-destructive' : (metrics?.alerts.active || 0) > 0 ? 'text-warning' : 'text-success',
      suffix: t('adminPages.dashboard.active'),
      ring: criticalAlerts > 0,
      alert: criticalAlerts > 0 ? { text: `${criticalAlerts} ${t('adminPages.dashboard.critical')}`, color: 'text-destructive' } : null,
    },
    {
      to: '/admin/vulnerabilities',
      icon: Bug,
      label: t('adminPages.dashboard.risks'),
      value: vulnStats?.total || 0,
      valueColor: (vulnStats?.critical || 0) > 0 ? 'text-warning' : 'text-success',
      alert: (vulnStats?.critical || 0) > 0 ? { text: `${vulnStats?.critical} ${t('adminPages.dashboard.critical')}`, color: 'text-warning' } : null,
    },
    {
      to: '/admin/ai-insights',
      icon: Brain,
      label: t('adminPages.dashboard.aiInsights'),
      value: insightsCount || 0,
      suffix: t('adminPages.dashboard.pending'),
      valueColor: (insightsCount || 0) > 0 ? 'text-accent' : 'text-success',
    },
  ], [t, onlineAgents, totalAgents, offlineAgents, metrics?.alerts.active, criticalAlerts, vulnStats?.total, vulnStats?.critical, insightsCount]);
  
  // Quick nav items - PERF-FIX: Memoize
  const quickNav = useMemo(() => [
    { icon: Activity, label: t('adminPages.dashboard.realTime'), to: '/admin/monitoring-advanced', color: 'text-info' },
    { icon: Brain, label: t('adminPages.dashboard.insightsAI'), to: '/admin/ai-insights', color: 'text-accent', badge: insightsCount },
    { icon: BarChart3, label: t('adminPages.dashboard.reports'), to: '/admin/reports', color: 'text-success' },
    { icon: Wrench, label: t('adminPages.dashboard.actionCenter'), to: '/admin/action-center', color: 'text-warning' },
  ], [t, insightsCount]);

  // Loading state
  if (metricsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  // Simple mode
  if (isSimple) {
    return (
      <div className="space-y-6">
        <div className="page-header-enterprise">
          <h1>{t('adminPages.dashboard.myProtection')}</h1>
          <p>{t('adminPages.dashboard.securityStatus')}</p>
        </div>
        <SimpleDashboard 
          globalStatus={globalStatus}
          stats={{ totalAgents, onlineAgents, offlineAgents, criticalAlerts }}
          isLoading={metricsLoading}
          tenantId={tenant?.id}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Banners — contextuais, somem quando resolvidos */}
      <OnboardingRequiredBanner />
      <PlanLimitBanner />
      <NotificationSetupBanner />
      <GovernanceHealthBanner />

      {/* ═══ BLOCO 1: Status + KPIs (sempre visível) ═══ */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }} 
        animate={{ opacity: 1, scale: 1 }} 
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Card className={cn(
          "border border-white/5 glass-card overflow-hidden shadow-premium group transition-all duration-700 rounded-[2.5rem]",
          globalStatus.variant === 'success' && "bg-success/5 border-l-4 border-l-success",
          globalStatus.variant === 'warning' && "bg-warning/5 border-l-4 border-l-warning",
          globalStatus.variant === 'danger' && "bg-destructive/5 border-l-4 border-l-destructive"
        )}>
          <CardContent className="py-10 px-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] via-transparent to-transparent pointer-events-none" />
            
            {/* Ambient glow that moves on hover */}
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-[80px] group-hover:bg-white/10 transition-colors duration-700" />

            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
                <div className={cn(
                  "p-6 rounded-[2.5rem] shrink-0 shadow-glow transition-all duration-700 group-hover:scale-110 group-hover:rotate-3",
                  globalStatus.variant === 'success' && "bg-success/20 border border-success/30",
                  globalStatus.variant === 'warning' && "bg-warning/20 border border-warning/30",
                  globalStatus.variant === 'danger' && "bg-destructive/20 border border-destructive/30"
                )}>
                  <Shield className={cn(
                    "h-10 w-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]",
                    globalStatus.variant === 'success' && "text-success",
                    globalStatus.variant === 'warning' && "text-warning",
                    globalStatus.variant === 'danger' && "text-destructive"
                  )} />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-display font-black text-white tracking-tight leading-tight">
                    {globalStatus.emoji} {globalStatus.title}
                  </h1>
                  <p className="text-lg text-white/40 font-medium mt-2 max-w-lg">
                    {globalStatus.description}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col items-center md:items-end gap-2 px-8 py-4 rounded-3xl bg-white/[0.02] border border-white/5">
                <div className={cn(
                  "text-5xl md:text-6xl font-display font-black tabular-nums tracking-tighter drop-shadow-sm",
                  securityScore >= 80 && "text-success shadow-glow",
                  securityScore >= 60 && securityScore < 80 && "text-warning",
                  securityScore < 60 && "text-destructive"
                )}>
                  {securityScore}%
                </div>
                <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                  {t('adminPages.dashboard.protectionLevel')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>


      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div 
              key={card.label} 
              custom={i} 
              initial="hidden" 
              animate="visible" 
              variants={fadeUp}
              whileHover={{ y: -5 }}
              className="h-full"
            >
              <Link to={card.to} className="block h-full">
                <Card className={cn(
                  "glass-card border-white/5 h-full transition-all duration-500 hover:border-cta-positive/30 shadow-premium relative overflow-hidden group rounded-[2rem]",
                  card.ring && "ring-1 ring-destructive/30"
                )}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {/* Subtle corner highlight */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cta-positive/5 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <CardContent className="p-8 relative z-10 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-8">
                      <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 transition-colors group-hover:bg-white/[0.08] group-hover:border-white/10">
                        <Icon className="h-5 w-5 text-white/50 group-hover:text-cta-positive transition-all duration-500" />
                      </div>
                      {card.ring && (
                        <div className="h-2 w-2 rounded-full bg-destructive animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                      )}
                    </div>

                    <div className="space-y-2 mt-auto">
                      <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em]">
                        {card.label}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={cn("text-4xl font-black tabular-nums tracking-tighter text-white", card.valueColor)}>
                          {card.value}
                        </span>
                        {card.suffix && (
                          <span className="text-xs font-bold text-white/20 uppercase tracking-widest">{card.suffix}</span>
                        )}
                      </div>
                    </div>

                    {card.alert && (
                      <div className="flex items-center gap-2 mt-6 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5 w-fit group-hover:bg-white/[0.05] transition-colors">
                        {card.alert.icon && <card.alert.icon className={cn("h-3.5 w-3.5", card.alert.color)} />}
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", card.alert.color)}>{card.alert.text}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>


      {/* Alertas críticos */}
      {criticalAlerts > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-sm text-destructive font-medium">
                  {t('adminPages.dashboard.criticalAlertsWaiting', { count: criticalAlerts })}
                </span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button 
                  size="sm" variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 h-8 text-xs flex-1 sm:flex-initial"
                  onClick={() => acknowledgeAllMutation.mutate()}
                  disabled={acknowledgeAllMutation.isPending}
                >
                  {t('adminPages.dashboard.acknowledge')}
                </Button>
                <Button 
                  size="sm" variant="destructive" className="h-8 text-xs flex-1 sm:flex-initial"
                  onClick={() => navigate('/admin/action-center')}
                >
                  {t('adminPages.dashboard.viewActions')} <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ═══ BLOCO 2: Visão Operacional (Tabs para reduzir scroll) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <Tabs defaultValue="fleet" className="w-full">
          <TabsList className="w-full justify-start bg-muted/30 h-9">
            <TabsTrigger value="fleet" className="text-xs gap-1.5">
              <Server className="h-3.5 w-3.5" />
              Frota
            </TabsTrigger>
            <TabsTrigger value="trends" className="text-xs gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Tendências
            </TabsTrigger>
            <TabsTrigger value="operations" className="text-xs gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Operações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fleet" className="mt-3">
            <FleetHealthDashboard />
          </TabsContent>

          <TabsContent value="trends" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProtectionTrendChartV2 />
              <HealthTrendChart />
            </div>
          </TabsContent>

          <TabsContent value="operations" className="mt-3 space-y-4">
            <SystemCyclesHealthCard />
            <ReleaseSignatureStatusCard />
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ═══ BLOCO 3: Assistente + Gamificação (lado a lado, compacto) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <XPLevelBar />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <SecurityAdvisorCard />
        <GamificationHub />
      </motion.div>

      {/* ═══ Risk Score ═══ */}
      <TenantRiskScore />

      {/* ═══ BLOCO 4: Atalhos rápidos (colapsável) ═══ */}
      <Collapsible open={extrasOpen} onOpenChange={setExtrasOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground h-9 text-xs">
            <span className="flex items-center gap-2">
              <Lightbulb className="h-3.5 w-3.5" />
              Acesso Rápido
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", extrasOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quickNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} to={item.to}>
                  <Card className="card-enterprise-hover transition-all hover:scale-[1.02] cursor-pointer backdrop-blur-sm">
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="p-1.5 rounded-md bg-muted/60">
                        <Icon className={cn("h-4 w-4", item.color)} />
                      </div>
                      <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                      {item.badge && item.badge > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.badge}</Badge>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <OnboardingWizard open={showOnboarding} onComplete={() => setShowOnboarding(false)} />
      <GuidedTour />
    </div>
  );
}
