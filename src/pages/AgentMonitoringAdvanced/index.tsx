import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Monitor, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentVersionStatus } from '@/components/monitoring/AgentVersionStatus';
import { OrphanedJobsAlert } from '@/components/monitoring/OrphanedJobsAlert';
import { PipelineHealthInline } from '@/components/pipeline/PipelineHealthInline';
import { AutomationRulesPanel } from '@/components/monitoring/AutomationRulesPanel';
import { AgentProcessesPanel } from '@/components/monitoring/AgentProcessesPanel';
import { useAgentMonitoring } from './useAgentMonitoring';
import { SummaryCards } from './SummaryCards';
import { SilentProblemsCard, GroupedAlertsCard } from './AlertsSection';
import { SearchFilters } from './SearchFilters';
import { AgentCard } from './AgentCard';

export default function AgentMonitoringAdvanced() {
  const {
    agents,
    summary,
    alerts,
    loading,
    isRefreshing,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    selectedAgentForProcesses,
    setSelectedAgentForProcesses,
    tenant,
    fetchDashboardData,
    groupedAlerts,
    resolveAlertGroup,
    silentProblems,
    sortedAgents,
  } = useAgentMonitoring();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Monitor className="w-8 h-8 text-primary" />
            Monitoramento em Tempo Real
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe a saúde dos seus computadores
          </p>
        </div>
        <Button onClick={() => fetchDashboardData(true)} variant="outline" disabled={isRefreshing}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <PipelineHealthInline tenantId={tenant?.id} tenantLoading={!tenant?.id} />

      <SummaryCards summary={summary} />

      <AgentVersionStatus 
        agents={agents.map(a => ({ 
          id: a.id, 
          name: a.name, 
          agent_version: a.agent_version,
          is_online: a.is_online 
        }))} 
        tenantId={tenant?.id || null}
        onRefresh={() => fetchDashboardData()}
      />

      <OrphanedJobsAlert 
        tenantId={tenant?.id || null}
        onRefresh={() => fetchDashboardData()}
      />

      <SilentProblemsCard silentProblems={silentProblems} />

      <GroupedAlertsCard 
        groupedAlerts={groupedAlerts} 
        totalAlerts={alerts.length}
        onResolveGroup={resolveAlertGroup}
      />

      <SearchFilters 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        summary={summary}
      />

      {/* Agents Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isProcessesSelected={selectedAgentForProcesses?.id === agent.id}
            onToggleProcesses={setSelectedAgentForProcesses}
          />
        ))}
      </div>

      {sortedAgents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Monitor className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum computador encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'Tente uma busca diferente' : 'Instale o agente nos computadores para começar o monitoramento'}
            </p>
          </CardContent>
        </Card>
      )}

      {selectedAgentForProcesses && (
        <AgentProcessesPanel
          agentId={selectedAgentForProcesses.id}
          agentName={selectedAgentForProcesses.name}
        />
      )}

      <AutomationRulesPanel />
    </div>
  );
}
