import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Shield, Server, AlertTriangle, WifiOff, 
  Brain, Bug, ShieldAlert, ChevronRight,
  Lightbulb, Activity, Wrench, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
import { SimpleDashboard } from '@/components/dashboard/SimpleDashboard';
import { GuidedTour } from '@/components/admin/GuidedTour';
import { SecurityAchievements } from '@/components/admin/SecurityAchievements';
import { FleetHealthDashboard } from '@/components/fleet/FleetHealthDashboard';
import { useProactiveAlerts } from '@/hooks/useProactiveAlerts';
import { useSimpleModeContext } from '@/hooks/useSimpleMode';
import { useTranslation } from 'react-i18next';
import { useUnifiedMetrics } from '@/hooks/useUnifiedMetrics';


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

  // Quick nav items
  const quickNav = [
    { icon: Activity, label: t('adminPages.dashboard.realTime'), to: '/admin/monitoring-advanced', color: 'text-info' },
    { icon: Brain, label: t('adminPages.dashboard.insightsAI'), to: '/admin/ai-insights', color: 'text-accent', badge: insightsCount },
    { icon: BarChart3, label: t('adminPages.dashboard.reports'), to: '/admin/reports', color: 'text-success' },
    { icon: Wrench, label: t('adminPages.dashboard.actionCenter'), to: '/admin/action-center', color: 'text-warning' },
  ];

  // Stat cards data
  const statCards = [
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
  ];

  return (
    <div className="space-y-6">
      {/* Banners */}
      <OnboardingRequiredBanner />
      <NotificationSetupBanner />
      <GovernanceHealthBanner />

      {/* ═══ SEÇÃO 1: Status global + Score ═══ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className={cn(
          "border-l-4 overflow-hidden backdrop-blur-sm",
          globalStatus.variant === 'success' && "border-l-success bg-gradient-to-r from-success/8 to-transparent",
          globalStatus.variant === 'warning' && "border-l-warning bg-gradient-to-r from-warning/8 to-transparent",
          globalStatus.variant === 'danger' && "border-l-destructive bg-gradient-to-r from-destructive/8 to-transparent"
        )}>
          <CardContent className="py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className={cn(
                  "p-3 rounded-2xl shrink-0 shadow-sm",
                  globalStatus.variant === 'success' && "bg-success/10",
                  globalStatus.variant === 'warning' && "bg-warning/10",
                  globalStatus.variant === 'danger' && "bg-destructive/10"
                )}>
                  <Shield className={cn(
                    "h-6 w-6 md:h-7 md:w-7",
                    globalStatus.variant === 'success' && "text-success",
                    globalStatus.variant === 'warning' && "text-warning",
                    globalStatus.variant === 'danger' && "text-destructive"
                  )} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base md:text-lg font-bold truncate">
                    {globalStatus.emoji} {globalStatus.title}
                  </h1>
                  <p className="text-xs md:text-sm text-muted-foreground truncate">
                    {globalStatus.description}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={cn(
                  "text-2xl md:text-3xl font-bold tabular-nums",
                  securityScore >= 80 && "text-success",
                  securityScore >= 60 && securityScore < 80 && "text-warning",
                  securityScore < 60 && "text-destructive"
                )}>
                  {securityScore}%
                </div>
                <div className="text-[10px] md:text-[11px] text-muted-foreground">
                  {t('adminPages.dashboard.protectionLevel')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ SEÇÃO 2: Métricas principais - 4 cards animados ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <Link to={card.to}>
                <Card className={cn(
                  "card-enterprise-hover cursor-pointer h-full transition-all duration-200 hover:scale-[1.02] backdrop-blur-sm",
                  card.ring && "ring-1 ring-destructive/20"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-md bg-muted/60">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        {card.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn("text-2xl font-bold tabular-nums", card.valueColor)}>
                        {card.value}
                      </span>
                      {card.suffix && (
                        <span className="text-xs text-muted-foreground">{card.suffix}</span>
                      )}
                    </div>
                    {card.alert && (
                      <div className="flex items-center gap-1 mt-2">
                        {card.alert.icon && <card.alert.icon className={cn("h-3 w-3", card.alert.color)} />}
                        <span className={cn("text-[11px]", card.alert.color)}>{card.alert.text}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* ═══ SEÇÃO 3: Alertas críticos inline ═══ */}
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

      {/* ═══ SEÇÃO 4: Gráficos lado a lado ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <ProtectionTrendChartV2 />
        <HealthTrendChart />
      </motion.div>

      {/* ═══ SEÇÃO 4.3: Fleet Health ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.27, duration: 0.4 }}
      >
        <FleetHealthDashboard />
      </motion.div>

      {/* ═══ SEÇÃO 4.5: Assistente de Segurança + Conquistas ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <SecurityAdvisorCard />
        <SecurityAchievements />
      </motion.div>

      {/* ═══ SEÇÃO 4.6: Status Ed25519 (super_admin only) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <ReleaseSignatureStatusCard />
      </motion.div>

      {/* ═══ SEÇÃO 5: Saúde dos Ciclos ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <SystemCyclesHealthCard />
      </motion.div>

      {/* ═══ SEÇÃO 6: Navegação rápida ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4 }}
      >
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
      </motion.div>

      {/* Reassurance */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-3 flex items-center justify-center gap-2 text-center">
          <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            {t('adminPages.dashboard.reassurance')}
            <span className="font-medium text-foreground"> {t('adminPages.dashboard.reassuranceBold')}</span>
          </p>
        </CardContent>
      </Card>

      <OnboardingWizard open={showOnboarding} onComplete={() => setShowOnboarding(false)} />

      {/* Guided Tour - shows on first visit */}
      <GuidedTour />
    </div>
  );
}
