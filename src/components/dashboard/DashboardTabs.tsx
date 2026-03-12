import { lazy, Suspense } from "react";
import { Users, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardAgent, DashboardJob, DashboardReport, DashboardAgentToken, DashboardRateLimit } from "@/hooks/useDashboardData";

const AgentsTab = lazy(() => import("./tabs/AgentsTab"));
const JobsTab = lazy(() => import("./tabs/JobsTab"));
const ReportsTab = lazy(() => import("./tabs/ReportsTab"));
const EvidenceTab = lazy(() => import("./tabs/EvidenceTab"));
const SecurityTab = lazy(() => import("./tabs/SecurityTab"));

const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-pulse text-muted-foreground">Carregando...</div>
  </div>
);

interface DashboardTabsProps {
  agents: DashboardAgent[];
  jobs: DashboardJob[];
  reports: DashboardReport[];
  agentTokens: DashboardAgentToken[];
  rateLimits: DashboardRateLimit[];
  loading: boolean;
  tenantNames: Record<string, string>;
}

export function DashboardTabs({
  agents, jobs, reports, agentTokens, rateLimits, loading, tenantNames,
}: DashboardTabsProps) {
  return (
    <Tabs defaultValue="agents" className="w-full">
      <TabsList className="grid w-full grid-cols-5 bg-secondary">
        <TabsTrigger value="agents">Computadores</TabsTrigger>
        <TabsTrigger value="jobs">Verificações</TabsTrigger>
        <TabsTrigger value="reports">Relatórios</TabsTrigger>
        <TabsTrigger value="evidence" className="gap-1">
          <Package className="h-3 w-3" />Evidências
        </TabsTrigger>
        <TabsTrigger value="security">Segurança</TabsTrigger>
      </TabsList>

      <Suspense fallback={<TabLoader />}>
        <TabsContent value="agents" className="mt-4">
          <AgentsTab agents={agents} jobs={jobs} reports={reports} loading={loading} tenantNames={tenantNames} />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <JobsTab jobs={jobs} loading={loading} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsTab reports={reports} loading={loading} />
        </TabsContent>
        <TabsContent value="evidence" className="mt-4">
          <EvidenceTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab agents={agents} agentTokens={agentTokens} rateLimits={rateLimits} loading={loading} tenantNames={tenantNames} />
        </TabsContent>
      </Suspense>
    </Tabs>
  );
}
