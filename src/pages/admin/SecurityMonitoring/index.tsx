import { useRef } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, AlertTriangle, Ban, Globe, MonitorOff } from 'lucide-react';
import { UI_LABELS } from '@/lib/ui-dictionary';
import { cn } from '@/lib/utils';
import { useSecurityMonitoring } from './useSecurityMonitoring';
import { StatusBanner } from './StatusBanner';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { EventsList } from './EventsList';
import { Sidebar } from './Sidebar';
import type { TimeRange } from './types';

export default function SecurityMonitoring() {
  const {
    data,
    isLoading,
    timeRange,
    setTimeRange,
    eventFilter,
    setEventFilter,
    isScanning,
    filteredEvents,
    handleUnblockIP,
    handleRunScan,
    handleRemediate,
  } = useSecurityMonitoring();

  const eventsRef = useRef<HTMLDivElement>(null);
  const m = data?.metrics;

  if (isLoading) {
    return (
      <AdminPageLayout title="Proteção em Tempo Real" description="Monitoramento de segurança do ambiente">
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={UI_LABELS.pages.security_monitoring.title}
      description={UI_LABELS.pages.security_monitoring.description}
    >
      <div className="space-y-5">
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <TabsList className="h-9">
              <TabsTrigger value="1h" className="text-xs px-3">1h</TabsTrigger>
              <TabsTrigger value="6h" className="text-xs px-3">6h</TabsTrigger>
              <TabsTrigger value="24h" className="text-xs px-3">24h</TabsTrigger>
              <TabsTrigger value="7d" className="text-xs px-3">7 dias</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={handleRunScan} variant="outline" size="sm" className="gap-2" disabled={isScanning}>
            <RefreshCw className={cn("h-3.5 w-3.5", isScanning && "animate-spin")} />
            {isScanning ? 'Verificando...' : 'Verificar Agora'}
          </Button>
        </div>

        {/* Status Banner */}
        {m && (
          <StatusBanner
            metrics={m}
            onScrollToEvents={() => eventsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onFilterCritical={() => setEventFilter('security')}
          />
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Alertas Críticos"
            value={m?.criticalEvents || 0}
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={m?.criticalEvents ? 'danger' : 'neutral'}
            subtitle={m?.activeAlerts ? `+${m.activeAlerts} pendente${m.activeAlerts > 1 ? 's' : ''}` : undefined}
          />
          <MetricCard
            label="Acessos Bloqueados"
            value={m?.blockedAttempts || 0}
            icon={<Ban className="h-4 w-4" />}
            variant={m?.blockedAttempts ? 'warning' : 'neutral'}
            subtitle="Sites e domínios"
          />
          <MetricCard
            label="IPs Bloqueados"
            value={m?.blockedIps || 0}
            icon={<Globe className="h-4 w-4" />}
            variant={m?.blockedIps ? 'warning' : 'neutral'}
            subtitle={m?.failedLogins ? `${m.failedLogins} tentativa${m.failedLogins > 1 ? 's' : ''} login` : undefined}
          />
          <MetricCard
            label="Computadores Offline"
            value={m?.agentsOffline || 0}
            icon={<MonitorOff className="h-4 w-4" />}
            variant={m?.agentsOffline ? 'danger' : 'neutral'}
            subtitle="Sem comunicação"
          />
        </div>

        {/* Activity Chart */}
        {data?.chartData && (
          <ActivityChart chartData={data.chartData} totalEvents={m?.totalEvents || 0} />
        )}

        {/* Events + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <EventsList
            filteredEvents={filteredEvents}
            allEventsCount={data?.unifiedEvents?.length || 0}
            categoryCounts={data?.categoryCounts || {}}
            eventFilter={eventFilter}
            onFilterChange={setEventFilter}
            onRemediate={handleRemediate}
            eventsRef={eventsRef}
          />
          <Sidebar
            activeAlerts={data?.activeAlerts || []}
            blockedIPs={data?.blockedIPs || []}
            failedLoginStats={data?.failedLoginStats || []}
            onUnblockIP={handleUnblockIP}
          />
        </div>
      </div>
    </AdminPageLayout>
  );
}
