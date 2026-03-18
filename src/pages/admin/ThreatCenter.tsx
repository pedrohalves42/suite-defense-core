import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Crosshair, Shield, AlertTriangle, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const ThreatIntelligence = lazy(() => import('./ThreatIntelligence'));
const SecurityMonitoring = lazy(() => import('./SecurityMonitoring'));
const AttackSimulation = lazy(() => import('./AttackSimulation'));

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'alerts', label: 'Alertas', icon: AlertTriangle },
  { value: 'threat-intel', label: 'Ameaças Conhecidas', icon: Crosshair },
  { value: 'attack-sim', label: 'Teste de Resistência', icon: Target },
] as const;

export default function ThreatCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'alerts';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Alertas de Segurança"
      description="Monitore alertas e ameaças identificadas nos seus computadores"
      icon={Shield}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-secondary h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="text-xs sm:text-sm gap-1.5">
              <Icon className="h-3.5 w-3.5 hidden sm:inline" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Suspense fallback={<TabLoader />}>
          <TabsContent value="alerts" className="mt-4">
            <SecurityMonitoring />
          </TabsContent>
          <TabsContent value="threat-intel" className="mt-4">
            <ThreatIntelligence />
          </TabsContent>
          <TabsContent value="attack-sim" className="mt-4">
            <AttackSimulation />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
