/**
 * DiagnosticsCenter - Página consolidada de diagnósticos
 *
 * Decomposed from a 1035-line God component into focused subcomponents.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { JobLiveMonitor } from '@/components/admin/JobLiveMonitor';
import { AgentHealthAlerts } from '@/components/admin/AgentHealthAlerts';
import { DynamicValidationSystem } from '@/components/admin/DynamicValidationSystem';
import { SectionDivider } from '@/components/ui/section-divider';
import { useDiagnosticsCenter } from './useDiagnosticsCenter';
import { DiagnosticsHeader } from './DiagnosticsHeader';
import { SummaryCards } from './SummaryCards';
import { AgentListSidebar } from './AgentListSidebar';
import { AgentDetailPanel } from './AgentDetailPanel';
import { CleanupDialogs } from './CleanupDialogs';

export default function DiagnosticsCenter() {
  const ctx = useDiagnosticsCenter();

  if (ctx.agentsLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <DiagnosticsHeader
        socMode={ctx.socMode}
        onSocModeChange={ctx.handleSocModeChange}
        onRefresh={ctx.handleRefresh}
      />

      <SummaryCards problemCounts={ctx.problemCounts} totalAgents={ctx.allAgents.length} />

      <JobLiveMonitor showSummary={false} maxJobs={5} className="border-primary/20" />

      <AgentHealthAlerts />

      <SectionDivider label="Sistema de Validação" />

      <DynamicValidationSystem />

      <div className="grid gap-6 lg:grid-cols-3">
        <AgentListSidebar
          problematicAgents={ctx.problematicAgents}
          allAgents={ctx.allAgents}
          socMode={ctx.socMode}
          selectedAgentId={ctx.selectedAgentId}
          onSelectAgent={ctx.setSelectedAgentId}
          getIssueInfo={ctx.getIssueInfo}
        />

        <AgentDetailPanel
          selectedAgent={ctx.selectedAgent}
          selectedAgentId={ctx.selectedAgentId}
          selectedAgentState={ctx.selectedAgentState}
          socMode={ctx.socMode}
          tenantId={ctx.tenant?.id}
          problematicAgents={ctx.problematicAgents}
          queryClient={ctx.queryClient}
          navigate={ctx.navigate}
          onCleanupAgent={ctx.setAgentToCleanup}
          onBulkCleanup={() => ctx.setShowBulkCleanupDialog(true)}
          onDownloadReinstallScript={ctx.handleDownloadReinstallScript}
        />
      </div>

      <CleanupDialogs
        agentToCleanup={ctx.agentToCleanup}
        onCloseAgentCleanup={() => ctx.setAgentToCleanup(null)}
        onConfirmAgentCleanup={(id) => ctx.cleanupMutation.mutate(id)}
        cleanupPending={ctx.cleanupMutation.isPending}
        showBulkCleanupDialog={ctx.showBulkCleanupDialog}
        onCloseBulkCleanup={ctx.setShowBulkCleanupDialog}
        onConfirmBulkCleanup={() => ctx.bulkCleanupMutation.mutate()}
        bulkCleanupPending={ctx.bulkCleanupMutation.isPending}
        problematicCount={ctx.problematicAgents.length}
      />
    </div>
  );
}
