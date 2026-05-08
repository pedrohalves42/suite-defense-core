import { lazy, Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, FileSearch, Workflow, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const SOC2Dashboard = lazy(() => import('./SOC2Dashboard'));
const ComplianceTimeline = lazy(() => import('./ComplianceTimeline'));
const SOC2Checklist = lazy(() => import('@/components/compliance/SOC2Checklist').then(m => ({ default: m.SOC2Checklist })));
const DriftDashboard = lazy(() => import('@/components/compliance/DriftDashboard').then(m => ({ default: m.DriftDashboard })));
const SystemAudit = lazy(() => import('./SystemAudit'));
const EvidenceBundlePage = lazy(() => import('./EvidenceBundlePage'));
const Playbooks = lazy(() => import('./Playbooks'));
const ComplianceAutomation = lazy(() => import('./ComplianceAutomation'));
const Governance = lazy(() => import('./Governance'));
const GovernanceReports = lazy(() => import('./GovernanceReports'));
const RiskScore = lazy(() => import('./RiskScore'));
const SecurityBenchmark = lazy(() => import('./SecurityBenchmark'));
const RansomwareIncident = lazy(() => import('./RansomwareIncident'));

const TabLoader = () => (
  <div className="space-y-6 py-8">
    <div className="h-10 w-64 rounded-xl bg-white/[0.03] animate-pulse" />
    <div className="h-80 w-full rounded-[2.5rem] bg-white/[0.03] border border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cta-positive/[0.02] to-transparent animate-shimmer" />
    </div>
  </div>
);

// TABS will be defined inside the component to use translation

// Map old route segments to tab values for backward compatibility
const SUB_TAB_MAP: Record<string, { tab: string }> = {
  'soc2-compliance': { tab: 'overview' },
  'compliance-timeline': { tab: 'overview' },
  'system-audit': { tab: 'evidence' },
  'evidence-bundle': { tab: 'evidence' },
  'governance-reports': { tab: 'evidence' },
  'playbooks': { tab: 'procedures' },
  'compliance-automation': { tab: 'procedures' },
  'governance': { tab: 'procedures' },
  'risk-score': { tab: 'risk' },
  'security-benchmark': { tab: 'risk' },
  'ransomware-incident': { tab: 'risk' },
};

export default function ComplianceHub() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const TABS = useMemo(() => [
    { value: 'overview', label: t('hubs.compliance.overview'), icon: ClipboardCheck },
    { value: 'evidence', label: t('hubs.compliance.evidence'), icon: FileSearch },
    { value: 'procedures', label: t('hubs.compliance.procedures'), icon: Workflow },
    { value: 'risk', label: t('hubs.compliance.risk'), icon: BarChart3 },
  ], [t]);
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title={t('hubs.compliance.title')}
      description={t('hubs.compliance.description')}
      icon={ClipboardCheck}
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
              <TabsContent value="overview" className="mt-6 space-y-6 outline-none">
                <SOC2Dashboard />
                <SOC2Checklist />
                <ComplianceTimeline />
              </TabsContent>
              <TabsContent value="evidence" className="mt-6 space-y-6 outline-none">
                <SystemAudit />
                <EvidenceBundlePage />
              </TabsContent>
              <TabsContent value="procedures" className="mt-6 space-y-6 outline-none">
                <Governance />
                <Playbooks />
                <ComplianceAutomation />
              </TabsContent>
              <TabsContent value="risk" className="mt-6 space-y-6 outline-none">
                <DriftDashboard />
                <RiskScore />
                <SecurityBenchmark />
                <RansomwareIncident />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
