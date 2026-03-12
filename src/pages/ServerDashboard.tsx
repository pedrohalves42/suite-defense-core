import { Server, Info } from "lucide-react";
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
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Server className="h-6 w-6 sm:h-8 sm:w-8 text-primary animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Painel Principal
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {tenant.name} — Visão global do sistema
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            {isAdmin && (
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
            )}
          </div>
        </div>

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

        {/* Footer */}
        <Card className="bg-muted/20 border-dashed border-muted-foreground/20">
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Info className="h-4 w-4" />
              Este painel monitora a saúde global do sistema em tempo real (atualiza a cada 10s).
            </p>
            <p className="text-sm text-primary mt-1">
              Se algo crítico surgir, você será alertado automaticamente.
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
