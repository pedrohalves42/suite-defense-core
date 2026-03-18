import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, Network, Shield } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const WebActivity = lazy(() => import('./WebActivity'));
const DNSFilter = lazy(() => import('./DNSFilter'));
const SecurityGraph = lazy(() => import('./SecurityGraph'));

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'web-activity', label: 'Sites Acessados', icon: Globe },
  { value: 'dns-filter', label: 'Filtro DNS', icon: Shield },
  { value: 'security-graph', label: 'Mapa de Segurança', icon: Network },
] as const;

export default function NetworkSecurityCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'web-activity';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Internet e Navegação"
      description="Monitore a atividade web e gerencie filtros de segurança da navegação"
      icon={Network}
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
          <TabsContent value="web-activity" className="mt-4">
            <WebActivity />
          </TabsContent>
          <TabsContent value="dns-filter" className="mt-4">
            <DNSFilter />
          </TabsContent>
          <TabsContent value="security-graph" className="mt-4">
            <SecurityGraph />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
