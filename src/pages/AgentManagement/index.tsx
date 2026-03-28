import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Server, RefreshCw, Trash, Loader2 } from 'lucide-react';
import { useAgentManagement } from './useAgentManagement';
import { StatsCards } from './StatsCards';
import { AgentFilters } from './AgentFilters';
import { AgentCard } from './AgentCard';
import { ProcessControlSection } from './ProcessControlSection';
import { ConfirmationDialogs } from './ConfirmationDialogs';

export default function AgentManagement() {
  const {
    agents, filteredAgents, stats, agentMetrics, installationStatus,
    isLoading, refetch,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, versionFilter, setVersionFilter, clearFilters,
    agentToDelete, setAgentToDelete, agentToDisable, setAgentToDisable,
    processControlOpen, setProcessControlOpen, canAccessProcessControl,
    generatingGroupReport, handleGroupForensicReport,
    checkingHealthFor,
    deleteAgentMutation, disableAgentMutation, cleanupGhostAgentsMutation, checkHealthMutation,
    getAgentStatus, isVersionOutdated, getTimeSince,
    t,
  } = useAgentManagement();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
            <Server className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold">{t('agentManagementPage.title')}</h2>
            <p className="text-muted-foreground">{t('agentManagementPage.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> {t('agentManagementPage.refresh')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => cleanupGhostAgentsMutation.mutate()} disabled={cleanupGhostAgentsMutation.isPending}>
            {cleanupGhostAgentsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash className="h-4 w-4 mr-2" />}
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <StatsCards stats={stats} statusFilter={statusFilter} versionFilter={versionFilter} onStatusFilter={setStatusFilter} onVersionFilter={setVersionFilter} />

      {canAccessProcessControl && agents && agents.length > 0 && (
        <ProcessControlSection agents={agents} open={processControlOpen} onOpenChange={setProcessControlOpen} getAgentStatus={getAgentStatus} />
      )}

      <AgentFilters
        searchTerm={searchTerm} onSearchChange={setSearchTerm}
        statusFilter={statusFilter} onStatusFilter={setStatusFilter}
        versionFilter={versionFilter} onVersionFilter={setVersionFilter}
        generatingGroupReport={generatingGroupReport} onGroupReport={handleGroupForensicReport}
        filteredCount={filteredAgents.length}
      />

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredAgents.map((agent) => {
            const status = getAgentStatus(agent);
            const outdated = isVersionOutdated(agent);
            return (
              <AgentCard
                key={agent.id}
                agent={agent}
                status={status}
                outdated={outdated}
                metrics={agentMetrics?.[agent.id]}
                installationComplete={installationStatus?.[agent.id]}
                checkingHealth={checkingHealthFor === agent.id}
                onCheckHealth={() => checkHealthMutation.mutate(agent)}
                onDisable={() => setAgentToDisable(agent)}
                onEnable={() => disableAgentMutation.mutate({ agentId: agent.id, disable: false })}
                onDelete={() => setAgentToDelete(agent)}
                getTimeSince={getTimeSince}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {filteredAgents.length === 0 && (
        <Card className="p-12">
          <div className="text-center space-y-4">
            <Server className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-medium">{t('agentManagementPage.noComputers')}</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || versionFilter !== 'all'
                  ? t('agentManagementPage.noComputersDesc')
                  : t('agentManagementPage.installFirst')}
              </p>
            </div>
            {(searchTerm || statusFilter !== 'all' || versionFilter !== 'all') && (
              <Button variant="outline" onClick={clearFilters}>Limpar Filtros</Button>
            )}
          </div>
        </Card>
      )}

      <ConfirmationDialogs
        agentToDelete={agentToDelete}
        onDeleteOpenChange={() => setAgentToDelete(null)}
        onDeleteConfirm={() => agentToDelete && deleteAgentMutation.mutate(agentToDelete.id)}
        agentToDisable={agentToDisable}
        onDisableOpenChange={() => setAgentToDisable(null)}
        onDisableConfirm={() => agentToDisable && disableAgentMutation.mutate({ agentId: agentToDisable.id, disable: true })}
      />
    </div>
  );
}
