import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, FileSearch, Workflow, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const SOC2Dashboard = lazy(() => import('./SOC2Dashboard'));
const ComplianceTimeline = lazy(() => import('./ComplianceTimeline'));
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
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'overview', label: 'Visão Geral', icon: ClipboardCheck },
  { value: 'evidence', label: 'Registros e Evidências', icon: FileSearch },
  { value: 'procedures', label: 'Planos de Ação', icon: Workflow },
  { value: 'risk', label: 'Risco', icon: BarChart3 },
] as const;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Conformidade"
      description="SOC 2, auditoria, procedimentos e gestão de risco em um só lugar"
      icon={ClipboardCheck}
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
          <TabsContent value="overview" className="mt-4 space-y-6">
            <SOC2Dashboard />
            <ComplianceTimeline />
          </TabsContent>
          <TabsContent value="evidence" className="mt-4 space-y-6">
            <SystemAudit />
            <EvidenceBundlePage />
          </TabsContent>
          <TabsContent value="procedures" className="mt-4 space-y-6">
            <Governance />
            <Playbooks />
            <ComplianceAutomation />
          </TabsContent>
          <TabsContent value="risk" className="mt-4 space-y-6">
            <RiskScore />
            <SecurityBenchmark />
            <RansomwareIncident />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
