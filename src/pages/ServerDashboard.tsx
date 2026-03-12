import { Server, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { SystemStatusBanner } from "@/components/dashboard/SystemStatusBanner";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { AdminMetricCards } from "@/components/dashboard/AdminMetricCards";
import { MultiTenantOverview } from "@/components/dashboard/MultiTenantOverview";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { SecurityTimeline } from "@/components/dashboard/SecurityTimeline";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { DashboardPDFReport } from "@/components/dashboard/DashboardPDFReport";
import { SystemBannerSkeleton, MetricCardsSkeleton, ChartsSkeleton, TimelineSkeleton } from "@/components/dashboard/DashboardSkeletons";

const ServerDashboard = () => {
  const { showOnboarding, completeOnboarding, dismissFor7Days } = useOnboarding();
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();

  const {
    agents, jobs, reports, agentTokens, rateLimits, virusScans, auditLogs,
    loading, tenant, tenantLoading, tenantNames,
  } = useDashboardData();

  const {
    offlineCount, failedJobs, alerts, agentsByTenant,
    sortedTenantsByGravity, tenantsWithIssues, onlinePercentage, systemState, successRate,
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
            <Server className="h-8 w-8 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Painel Principal
            </h1>
            <p className="text-sm text-muted-foreground">
              {tenant.name} — Visão global do sistema
            </p>
          </div>
        </div>

        {/* Layer 1: Global Status */}
        <SystemStatusBanner
          systemState={systemState}
          onlinePercentage={onlinePercentage}
          offlineCount={offlineCount}
          failedJobs={failedJobs}
          tenantsWithIssues={tenantsWithIssues}
          totalAgents={agents.length}
          totalTenants={Object.keys(agentsByTenant).length}
        />

        {/* Layer 2: Metric Cards */}
        <MetricCards
          totalAgents={agents.length}
          onlinePercentage={onlinePercentage}
          offlineCount={offlineCount}
          alerts={alerts}
          successRate={successRate}
          failedJobs={failedJobs}
        />

        {/* Layer 2.5: Admin Metrics */}
        {isAdmin && (
          <AdminMetricCards
            agents={agents}
            jobs={jobs}
            agentTokens={agentTokens}
            rateLimits={rateLimits}
          />
        )}

        {/* Layer 3: Multi-Tenant Overview */}
        {isSuperAdmin && Object.keys(agentsByTenant).length > 1 && (
          <MultiTenantOverview
            tenants={sortedTenantsByGravity}
            agentsByTenant={agentsByTenant}
          />
        )}

        {/* Charts */}
        <DashboardCharts jobs={jobs} virusScans={virusScans} loading={loading} />

        {/* Security Timeline */}
        <SecurityTimeline auditLogs={auditLogs} loading={loading} />

        {/* Detail Tabs */}
        <DashboardTabs
          agents={agents}
          jobs={jobs}
          reports={reports}
          agentTokens={agentTokens}
          rateLimits={rateLimits}
          loading={loading}
          tenantNames={tenantNames}
        />

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
