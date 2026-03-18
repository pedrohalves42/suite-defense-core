import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrainCircuit, Zap, Eye, BookOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const AIInsights = lazy(() => import('./AIInsights'));
const InsightTriageCenter = lazy(() => import('./InsightTriageCenter'));
const ConfidenceGapDashboard = lazy(() => import('./ConfidenceGapDashboard'));
const RulesManagement = lazy(() => import('./RulesManagement'));
const AIActionApproval = lazy(() => import('./AIActionApproval'));
const AIAnomalies = lazy(() => import('./AIAnomalies'));
const DecisionAudit = lazy(() => import('./DecisionAudit'));
const AIFeedbackDashboard = lazy(() => import('./AIFeedbackDashboard'));
const SoftwareKnowledgeBase = lazy(() => import('./SoftwareKnowledgeBase'));

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'insights', label: 'Sugestões', icon: BrainCircuit },
  { value: 'automation', label: 'Automação', icon: Zap },
  { value: 'governance', label: 'Revisão de Decisões', icon: Eye },
  { value: 'knowledge', label: 'Conhecimento', icon: BookOpen },
] as const;

export default function IntelligenceHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'insights';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Inteligência IA"
      description="Insights, automação, governança e base de conhecimento em um só lugar"
      icon={BrainCircuit}
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
          <TabsContent value="insights" className="mt-4 space-y-6">
            <AIInsights />
            <InsightTriageCenter />
            <ConfidenceGapDashboard />
          </TabsContent>
          <TabsContent value="automation" className="mt-4 space-y-6">
            <RulesManagement />
            <AIActionApproval />
            <AIAnomalies />
          </TabsContent>
          <TabsContent value="governance" className="mt-4 space-y-6">
            <DecisionAudit />
            <AIFeedbackDashboard />
          </TabsContent>
          <TabsContent value="knowledge" className="mt-4 space-y-6">
            <SoftwareKnowledgeBase />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
