import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Gauge, ScrollText, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const CronHealthDashboard = lazy(() => import('./CronHealthDashboard'));
const SystemHealth = lazy(() => import('./SystemHealth'));
const JobsHealthDashboard = lazy(() => import('./JobsHealthDashboard'));
const InstallationHealth = lazy(() => import('./InstallationHealth'));
const PerformanceMetrics = lazy(() => import('./PerformanceMetrics'));
const RateLimitingStats = lazy(() => import('./RateLimitingStats'));
const SLODashboard = lazy(() => import('./SLODashboard'));
const SystemOperations = lazy(() => import('./SystemOperations'));
const SystemLogs = lazy(() => import('./SystemLogs'));
const DeadLetterQueue = lazy(() => import('./DeadLetterQueue'));
const MassReinstall = lazy(() => import('./MassReinstall'));
const JobsV3Migration = lazy(() => import('./JobsV3Migration'));

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'health', label: 'Saúde', icon: Heart },
  { value: 'performance', label: 'Performance', icon: Gauge },
  { value: 'logs', label: 'Logs & Operações', icon: ScrollText },
  { value: 'tools', label: 'Ferramentas', icon: Wrench },
] as const;

export default function OperationsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'health';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Operações do Sistema"
      description="Saúde, performance, logs e ferramentas operacionais em um só lugar"
      icon={Gauge}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-secondary h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="text-xs sm:text-sm gap-1.5">
              <Icon className="h-3.5 w-3.5 hidden sm:inline" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Suspense fallback={<TabLoader />}>
          <TabsContent value="health" className="mt-4 space-y-6">
            <CronHealthDashboard />
            <SystemHealth />
            <JobsHealthDashboard />
            <InstallationHealth />
          </TabsContent>
          <TabsContent value="performance" className="mt-4 space-y-6">
            <PerformanceMetrics />
            <RateLimitingStats />
            <SLODashboard />
          </TabsContent>
          <TabsContent value="logs" className="mt-4 space-y-6">
            <SystemOperations />
            <SystemLogs />
            <DeadLetterQueue />
          </TabsContent>
          <TabsContent value="tools" className="mt-4 space-y-6">
            <MassReinstall />
            <JobsV3Migration />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
