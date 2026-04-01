import React from 'react';
import { Button } from '@/components/ui/button';
import { Shield, RefreshCw, FileText, Download } from 'lucide-react';
import { useComplianceTimeline } from './useComplianceTimeline';
import { ComplianceStatsCards } from './ComplianceStatsCards';
import { ComplianceFilters } from './ComplianceFilters';
import { ComplianceCharts } from './ComplianceCharts';

const ComplianceTimeline: React.FC = () => {
  const hook = useComplianceTimeline();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Timeline de Compliance
            </h2>
            <p className="text-sm text-muted-foreground">
              Registro de evidências e eventos de segurança para auditoria
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => hook.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={hook.exportCSV}>
            <FileText className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="default" size="sm" onClick={hook.exportPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      <ComplianceStatsCards
        totalEvents={hook.filteredLogs.length}
        criticalEvents={hook.filteredLogs.filter(l => l.severity === 'critical').length}
        activeAgents={hook.uniqueAgents.length}
        eventTypes={hook.uniqueEventTypes.length}
      />

      <ComplianceFilters
        searchTerm={hook.searchTerm}
        onSearchChange={hook.setSearchTerm}
        dateRange={hook.dateRange}
        onDateRangeChange={hook.setDateRange}
        eventTypeFilter={hook.eventTypeFilter}
        onEventTypeChange={hook.setEventTypeFilter}
        severityFilter={hook.severityFilter}
        onSeverityChange={hook.setSeverityFilter}
        agentFilter={hook.agentFilter}
        onAgentChange={hook.setAgentFilter}
        uniqueEventTypes={hook.uniqueEventTypes}
        uniqueAgents={hook.uniqueAgents}
      />

      <ComplianceCharts
        eventsByDayData={hook.eventsByDayData}
        eventsByTypeData={hook.eventsByTypeData}
        eventsBySeverityData={hook.eventsBySeverityData}
        filteredLogs={hook.filteredLogs}
        isLoading={hook.isLoading}
      />
    </div>
  );
};

export default ComplianceTimeline;
