import { Activity, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { PipelineHealthInline } from '@/components/pipeline/PipelineHealthInline';
import { useAgentMonitoring } from './useAgentMonitoring';
import { GlobalStatusBanner } from './GlobalStatusBanner';
import { MetricCards } from './MetricCards';
import { TrendCharts } from './TrendCharts';
import { AgentsList } from './AgentsList';
import { RecentJobs } from './RecentJobs';

const AgentMonitoring = () => {
  const {
    tenant,
    tenantLoading,
    lastUpdate,
    handleRefresh,
    totalAgents,
    onlineAgents,
    offlineAgents,
    failedJobs,
    successRate,
    globalStatus,
    sortedAgents,
    recentJobs,
    scansTrendData,
    jobsTrendData,
    uptimeChartData,
    getTimeSince,
  } = useAgentMonitoring();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
            <Activity className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Monitoramento em Tempo Real
            </h1>
            <p className="text-sm text-muted-foreground">Acompanhe status e performance dos computadores</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Atualizado: {formatBrazilDateTime(lastUpdate, 'time')}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Pipeline Health */}
      <PipelineHealthInline tenantId={tenant?.id} tenantLoading={tenantLoading} />

      {/* Global Status */}
      <GlobalStatusBanner
        globalStatus={globalStatus}
        totalAgents={totalAgents}
        onlineAgents={onlineAgents}
        offlineAgents={offlineAgents}
        failedJobs={failedJobs}
        successRate={successRate}
      />

      {/* Metric Cards */}
      <MetricCards
        totalAgents={totalAgents}
        onlineAgents={onlineAgents}
        offlineAgents={offlineAgents}
        successRate={successRate}
      />

      {/* Charts */}
      <TrendCharts
        scansTrendData={scansTrendData}
        jobsTrendData={jobsTrendData}
        uptimeChartData={uptimeChartData}
      />

      {/* Agents List */}
      <AgentsList sortedAgents={sortedAgents} getTimeSince={getTimeSince} />

      {/* Recent Jobs */}
      <RecentJobs recentJobs={recentJobs} />

      {/* Trust Anchor */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Esta página atualiza automaticamente em tempo real.
            <br />
            <span className="text-primary">Se algo crítico acontecer, você será alertado imediatamente.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentMonitoring;
