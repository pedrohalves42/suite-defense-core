import { Server, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useDashboardQueries } from "@/hooks/useDashboardQueries";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { SystemStatusBanner } from "@/components/dashboard/SystemStatusBanner";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { AdminMetricCards } from "@/components/dashboard/AdminMetricCards";
import { MultiTenantOverview } from "@/components/dashboard/MultiTenantOverview";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { SecurityTimeline } from "@/components/dashboard/SecurityTimeline";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { DashboardPDFReport } from "@/components/dashboard/DashboardPDFReport";
import { DashboardErrorBoundary } from "@/components/dashboard/DashboardErrorBoundary";
import { SystemBannerSkeleton, MetricCardsSkeleton } from "@/components/dashboard/DashboardSkeletons";
import { WebVitalsCard } from "@/components/dashboard/WebVitalsCard";
import { NotificationBell } from "@/components/dashboard/NotificationBell";

const ServerDashboard = () => {
  const { t } = useTranslation();
  useSessionGuard();
  const { showOnboarding, completeOnboarding, dismissFor7Days } = useOnboarding();
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();

  const {
    agents, jobs, reports, agentTokens, rateLimits, virusScans, auditLogs,
    loading, tenant, tenantLoading, tenantNames,
  } = useDashboardQueries();

  const {
    offlineCount, failedJobs, alerts, agentsByTenant,
    sortedTenantsByGravity, tenantsWithIssues, onlinePercentage, systemState, successRate, trends,
  } = useDashboardMetrics(agents, jobs, tenantNames);

  // Loading state
  if (tenantLoading || !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Server className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && agents.length === 0) {
    return <DashboardEmptyState tenantName={tenant.name} />;
  }

  return (
    <div className="min-h-screen bg-transparent p-3 sm:p-4 md:p-6 lg:p-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8 lg:space-y-12">
        {/* Header — stacks on mobile, side-by-side from sm+ */}
        <header 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-white/5 pb-8 sm:pb-10"
          role="banner"
        >
          <div className="flex items-center gap-5 sm:gap-6 min-w-0">
            <div className="p-4 bg-cta-positive/10 rounded-2xl border border-cta-positive/20 shadow-glow transition-transform hover:scale-110 duration-700 flex-shrink-0">
              <Server className="h-8 w-8 text-cta-positive animate-pulse" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-white truncate">
                {t('nav.dashboard')}
              </h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cta-positive/10 border border-cta-positive/20">
                  <span className="w-2 h-2 rounded-full bg-cta-positive animate-pulse flex-shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-cta-positive">Live System</span>
                </div>
                <p className="text-sm font-bold text-white/30 truncate uppercase tracking-widest">
                  <span className="truncate">{tenant.name}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto flex-shrink-0">
            <NotificationBell />
            {isAdmin && (
              <div className="transition-transform hover:scale-105 active:scale-95">
                <DashboardPDFReport
                  agents={agents}
                  jobs={jobs}
                  tenantName={tenant.name}
                  onlinePercentage={onlinePercentage}
                  successRate={successRate}
                  offlineCount={offlineCount}
                  failedJobs={failedJobs}
                  alerts={alerts}
                  systemState={systemState}
                />
              </div>
            )}
          </div>
        </header>

        {/* Layer 1: Global Status */}
        <DashboardErrorBoundary section="Status Global">
          {loading ? <SystemBannerSkeleton /> : (
            <SystemStatusBanner
              systemState={systemState}
              onlinePercentage={onlinePercentage}
              offlineCount={offlineCount}
              failedJobs={failedJobs}
              tenantsWithIssues={tenantsWithIssues}
              totalAgents={agents.length}
              totalTenants={Object.keys(agentsByTenant).length}
            />
          )}
        </DashboardErrorBoundary>

        {/* Layer 2: Metric Cards */}
        <DashboardErrorBoundary section="Métricas">
          {loading ? <MetricCardsSkeleton /> : (
            <MetricCards
              totalAgents={agents.length}
              onlinePercentage={onlinePercentage}
              offlineCount={offlineCount}
              alerts={alerts}
              successRate={successRate}
              failedJobs={failedJobs}
              trends={trends}
            />
          )}
        </DashboardErrorBoundary>

        {/* Layer 2.5: Admin Metrics */}
        {isAdmin && (
          <DashboardErrorBoundary section="Métricas Admin">
            <AdminMetricCards
              agents={agents}
              jobs={jobs}
              agentTokens={agentTokens}
              rateLimits={rateLimits}
            />
          </DashboardErrorBoundary>
        )}

        {/* Layer 3: Multi-Tenant Overview */}
        {isSuperAdmin && Object.keys(agentsByTenant).length > 1 && (
          <DashboardErrorBoundary section="Multi-Empresa">
            <MultiTenantOverview
              tenants={sortedTenantsByGravity}
              agentsByTenant={agentsByTenant}
            />
          </DashboardErrorBoundary>
        )}

        {/* Web Vitals APM */}
        {isAdmin && (
          <DashboardErrorBoundary section="Web Vitals">
            <WebVitalsCard />
          </DashboardErrorBoundary>
        )}

        {/* Charts */}
        <DashboardErrorBoundary section="Gráficos">
          <DashboardCharts jobs={jobs} virusScans={virusScans} loading={loading} />
        </DashboardErrorBoundary>

        {/* Security Timeline */}
        <DashboardErrorBoundary section="Timeline de Segurança">
          <SecurityTimeline auditLogs={auditLogs} loading={loading} />
        </DashboardErrorBoundary>

        {/* Detail Tabs */}
        <DashboardErrorBoundary section="Detalhes">
          <DashboardTabs
            agents={agents}
            jobs={jobs}
            reports={reports}
            agentTokens={agentTokens}
            rateLimits={rateLimits}
            loading={loading}
            tenantNames={tenantNames}
          />
        </DashboardErrorBoundary>

        <Card className="glass-card border-white/5 shadow-2xl relative overflow-hidden group hover:border-cta-positive/20 transition-all duration-700">
          <div className="absolute inset-0 bg-cta-positive/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardContent className="py-12 sm:py-16 text-center relative z-10">
            <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/[0.03] border border-white/5 mb-6">
              <Info className="h-4 w-4 text-cta-positive animate-pulse" />
              <p className="text-sm text-white/50 font-bold uppercase tracking-widest">
                System Monitoring Active
              </p>
            </div>
            <p className="text-lg text-white/40 font-medium max-w-2xl mx-auto leading-relaxed">
              Este painel monitora a saúde global do sistema em tempo real. Sincronização inteligente a cada 10s.
            </p>
          </CardContent>
        </Card>
      </div>

      <OnboardingTour
        open={showOnboarding}
        onClose={() => {}}
        onComplete={completeOnboarding}
        onDismiss7Days={dismissFor7Days}
        onDismissForever={completeOnboarding}
      />
    </div>
  );
};

export default ServerDashboard;
