import { useEffect, useState, Suspense, lazy } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/useTenant';
import { 
  Shield, Server, AlertTriangle, CheckCircle, WifiOff, 
  ArrowRight, Brain, Bug, ShieldAlert, ChevronRight,
  Lightbulb, Activity, Wrench, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { toast } from 'sonner';
import { ProtectionTrendChart } from '@/components/admin/ProtectionTrendChart';
import { GovernanceHealthBanner } from '@/components/admin/GovernanceHealthBanner';
import { NotificationSetupBanner } from '@/components/admin/NotificationSetupBanner';
import { OnboardingRequiredBanner } from '@/components/admin/OnboardingRequiredBanner';
import { CompactAlert } from '@/components/ui/explainable-alert';
import { SimpleDashboard } from '@/components/dashboard/SimpleDashboard';
import { useSimpleModeContext } from '@/hooks/useSimpleMode';

export default function Dashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isSimple } = useSimpleModeContext();

  useEffect(() => {
    const onboardingParam = searchParams.get('onboarding');
    if (onboardingParam === 'true') {
      setShowOnboarding(true);
      searchParams.delete('onboarding');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch agents
  const { data: agents, isLoading: agentsLoading, isFetched: agentsFetched } = useQuery({
    queryKey: ['agent-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agent_health_metrics', {
        p_tenant_id: tenant.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !tenantLoading && !!tenant?.id,
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
    enabled: !tenantLoading && !!tenant?.id,
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
    enabled: !tenantLoading && !!tenant?.id,
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
    enabled: !tenantLoading && !!tenant?.id,
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
  const hasAgentData = agentsFetched && agents && agents.length > 0;
  const totalAgents = hasAgentData ? agents.length : 0;
  const onlineAgents = hasAgentData 
    ? agents.filter((a: any) => a.health_status === 'healthy' || a.health_status === 'critical').length 
    : 0;
  const offlineAgents = hasAgentData 
    ? agents.filter((a: any) => a.health_status === 'offline' || a.health_status === 'never_connected').length 
    : 0;
  const criticalAlerts = alerts?.filter(a => a.severity === 'critical' || a.severity === 'high').length || 0;

  // Security score
  const calculateSecurityScore = () => {
    let score = 100;
    score -= Math.min(offlineAgents * 5, 25);
    score -= Math.min(criticalAlerts * 10, 30);
    score -= Math.min((vulnStats?.critical || 0) * 5, 25);
    return Math.max(0, score);
  };
  const securityScore = calculateSecurityScore();

  // Global status
  const getGlobalStatus = () => {
    if (securityScore >= 80 && criticalAlerts === 0) {
      return { emoji: '🟢', title: 'Tudo sob controle', description: 'Seus computadores estão protegidos.', variant: 'success' as const };
    }
    if (securityScore >= 60 || criticalAlerts <= 2) {
      return { emoji: '🟡', title: 'Atenção necessária', description: 'Alguns itens precisam de verificação.', variant: 'warning' as const };
    }
    return { emoji: '🔴', title: 'Ação urgente', description: 'Existe risco que pode impactar sua operação.', variant: 'danger' as const };
  };
  const globalStatus = getGlobalStatus();

  // Loading state
  if (!tenant?.id || agentsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  // Simple mode
  if (isSimple) {
    return (
      <div className="space-y-6">
        <div className="page-header-enterprise">
          <h1>Minha Proteção</h1>
          <p>Status de segurança dos seus computadores</p>
        </div>
        <SimpleDashboard 
          globalStatus={globalStatus}
          stats={{ totalAgents, onlineAgents, offlineAgents, criticalAlerts }}
          isLoading={agentsLoading}
          tenantId={tenant?.id}
        />
      </div>
    );
  }

  // Quick nav items
  const quickNav = [
    { icon: Activity, label: 'Tempo Real', to: '/admin/monitoring-advanced', color: 'text-blue-500' },
    { icon: Brain, label: 'Insights IA', to: '/admin/ai-insights', color: 'text-purple-500', badge: insightsCount || 0 },
    { icon: BarChart3, label: 'Relatórios', to: '/admin/reports', color: 'text-emerald-500' },
    { icon: Wrench, label: 'Central de Ações', to: '/admin/action-center', color: 'text-amber-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Banners - only show if needed */}
      <OnboardingRequiredBanner />
      <NotificationSetupBanner />
      <GovernanceHealthBanner />

      {/* ═══════════════════════════════════════════
          SEÇÃO 1: Status global + Score 
          ═══════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn(
          "border-l-4",
          globalStatus.variant === 'success' && "border-l-green-500 bg-green-500/5",
          globalStatus.variant === 'warning' && "border-l-amber-500 bg-amber-500/5",
          globalStatus.variant === 'danger' && "border-l-red-500 bg-red-500/5"
        )}>
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-3 rounded-full",
                  globalStatus.variant === 'success' && "bg-green-500/10",
                  globalStatus.variant === 'warning' && "bg-amber-500/10",
                  globalStatus.variant === 'danger' && "bg-red-500/10"
                )}>
                  <Shield className={cn(
                    "h-7 w-7",
                    globalStatus.variant === 'success' && "text-green-500",
                    globalStatus.variant === 'warning' && "text-amber-500",
                    globalStatus.variant === 'danger' && "text-red-500"
                  )} />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{globalStatus.emoji} {globalStatus.title}</h1>
                  <p className="text-sm text-muted-foreground">{globalStatus.description}</p>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className={cn(
                  "text-3xl font-bold",
                  securityScore >= 80 && "text-green-600",
                  securityScore >= 60 && securityScore < 80 && "text-amber-600",
                  securityScore < 60 && "text-red-600"
                )}>
                  {securityScore}%
                </div>
                <div className="text-[11px] text-muted-foreground">Nível de proteção</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════
          SEÇÃO 2: Métricas principais - 4 cards 
          ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Computadores */}
        <Link to="/admin/agent-health">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Computadores</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-green-600">{onlineAgents}</span>
                <span className="text-xs text-muted-foreground">/ {totalAgents}</span>
              </div>
              {offlineAgents > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <WifiOff className="h-3 w-3 text-orange-500" />
                  <span className="text-xs text-orange-500">{offlineAgents} offline</span>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Alertas */}
        <Link to="/admin/security-monitoring">
          <Card className={cn(
            "hover:bg-accent/50 transition-colors cursor-pointer h-full",
            criticalAlerts > 0 && "ring-1 ring-red-500/20"
          )}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Alertas</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={cn(
                  "text-2xl font-bold",
                  criticalAlerts > 0 ? "text-red-500" : (alerts?.length || 0) > 0 ? "text-amber-500" : "text-green-600"
                )}>
                  {alerts?.length || 0}
                </span>
                <span className="text-xs text-muted-foreground">ativos</span>
              </div>
              {criticalAlerts > 0 && (
                <span className="text-xs text-red-500 mt-1 block">{criticalAlerts} críticos</span>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Vulnerabilidades */}
        <Link to="/admin/vulnerabilities">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Riscos</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={cn(
                  "text-2xl font-bold",
                  (vulnStats?.critical || 0) > 0 ? "text-orange-500" : "text-green-600"
                )}>
                  {vulnStats?.total || 0}
                </span>
              </div>
              {(vulnStats?.critical || 0) > 0 && (
                <span className="text-xs text-orange-500 mt-1 block">{vulnStats?.critical} críticos</span>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* IA Insights */}
        <Link to="/admin/ai-insights">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Insights IA</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={cn(
                  "text-2xl font-bold",
                  (insightsCount || 0) > 0 ? "text-purple-500" : "text-green-600"
                )}>
                  {insightsCount || 0}
                </span>
                <span className="text-xs text-muted-foreground">pendentes</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════
          SEÇÃO 3: Alertas críticos inline (se houver)
          ═══════════════════════════════════════════ */}
      {criticalAlerts > 0 && (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive font-medium">
                {criticalAlerts} alerta{criticalAlerts > 1 ? 's' : ''} crítico{criticalAlerts > 1 ? 's' : ''} aguardando ação
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10 h-8 text-xs"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={acknowledgeAllMutation.isPending}
              >
                Reconhecer
              </Button>
              <Button 
                size="sm" variant="destructive" className="h-8 text-xs"
                onClick={() => navigate('/admin/action-center')}
              >
                Ver ações <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════
          SEÇÃO 4: Gráfico de tendência
          ═══════════════════════════════════════════ */}
      <ProtectionTrendChart />

      {/* ═══════════════════════════════════════════
          SEÇÃO 5: Navegação rápida
          ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quickNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.to}>
              <Card className="hover:bg-accent/50 transition-all hover:scale-[1.02] cursor-pointer">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Icon className={cn("h-4 w-4", item.color)} />
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.badge}</Badge>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Reassurance */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-3 flex items-center justify-center gap-2 text-center">
          <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            O CyberShield monitora seus computadores automaticamente. 
            <span className="font-medium text-foreground"> Se algo crítico acontecer, você será avisado.</span>
          </p>
        </CardContent>
      </Card>

      <OnboardingWizard open={showOnboarding} onComplete={() => setShowOnboarding(false)} />
    </div>
  );
}
