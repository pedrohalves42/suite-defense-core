import { lazy, Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Gauge, ScrollText, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const CronHealthDashboard = lazy(() => import('./CronHealthDashboard'));
const CronHealthAlert = lazy(() => import('@/components/operations/CronHealthAlert').then(m => ({ default: m.CronHealthAlert })));
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
  <div className="space-y-6 py-8">
    <div className="h-10 w-64 rounded-xl bg-white/[0.03] animate-pulse" />
    <div className="h-80 w-full rounded-[2.5rem] bg-white/[0.03] border border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cta-positive/[0.02] to-transparent animate-shimmer" />
    </div>
  </div>
);

// TABS inside component

export default function OperationsHub() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'health';
  const [activeTab, setActiveTab] = useState(initialTab);

  const TABS = useMemo(() => [
    { value: 'health', label: t('hubs.operations.health'), icon: Heart },
    { value: 'performance', label: t('hubs.operations.performance'), icon: Gauge },
    { value: 'logs', label: t('hubs.operations.logs'), icon: ScrollText },
    { value: 'tools', label: t('hubs.operations.tools'), icon: Wrench },
  ], [t]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title={t('hubs.operations.title')}
      description={t('hubs.operations.description')}
      icon={Gauge}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-white/[0.03] border border-white/5 p-1 h-auto rounded-2xl">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="text-xs sm:text-sm gap-1.5 rounded-xl data-[state=active]:bg-cta-positive/10 data-[state=active]:text-cta-positive data-[state=active]:border-cta-positive/20 border border-transparent transition-all duration-300">
              <Icon className="h-3.5 w-3.5 hidden sm:inline" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Suspense fallback={<TabLoader />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <TabsContent value="health" className="mt-6 space-y-6 outline-none">
                <CronHealthAlert />
                <CronHealthDashboard />
                <SystemHealth />
                <JobsHealthDashboard />
                <InstallationHealth />
              </TabsContent>
              <TabsContent value="performance" className="mt-6 space-y-6 outline-none">
                <PerformanceMetrics />
                <RateLimitingStats />
                <SLODashboard />
              </TabsContent>
              <TabsContent value="logs" className="mt-6 space-y-6 outline-none">
                <SystemOperations />
                <SystemLogs />
                <DeadLetterQueue />
              </TabsContent>
              <TabsContent value="tools" className="mt-6 space-y-6 outline-none">
                <MassReinstall />
                <JobsV3Migration />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
