import { lazy, Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrainCircuit, Zap, Eye, BookOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

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
  <div className="space-y-6 py-8">
    <div className="h-10 w-64 rounded-xl bg-white/[0.03] animate-pulse" />
    <div className="h-80 w-full rounded-[2.5rem] bg-white/[0.03] border border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cta-positive/[0.02] to-transparent animate-shimmer" />
    </div>
  </div>
);

// TABS inside component

export default function IntelligenceHub() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'insights';
  const [activeTab, setActiveTab] = useState(initialTab);

  const TABS = useMemo(() => [
    { value: 'insights', label: t('hubs.intelligence.insights'), icon: BrainCircuit },
    { value: 'automation', label: t('hubs.intelligence.automation'), icon: Zap },
    { value: 'governance', label: t('hubs.intelligence.governance'), icon: Eye },
    { value: 'knowledge', label: t('hubs.intelligence.knowledge'), icon: BookOpen },
  ], [t]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title={t('hubs.intelligence.title')}
      description={t('hubs.intelligence.description')}
      icon={BrainCircuit}
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
              <TabsContent value="insights" className="mt-6 space-y-6 outline-none">
                <AIInsights />
                <InsightTriageCenter />
                <ConfidenceGapDashboard />
              </TabsContent>
              <TabsContent value="automation" className="mt-6 space-y-6 outline-none">
                <RulesManagement />
                <AIActionApproval />
                <AIAnomalies />
              </TabsContent>
              <TabsContent value="governance" className="mt-6 space-y-6 outline-none">
                <DecisionAudit />
                <AIFeedbackDashboard />
              </TabsContent>
              <TabsContent value="knowledge" className="mt-6 space-y-6 outline-none">
                <SoftwareKnowledgeBase />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
