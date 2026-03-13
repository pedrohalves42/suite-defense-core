import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Eye, FileWarning } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const SoftwareInventory = lazy(() => import('./SoftwareInventory'));
const ShadowITDiscovery = lazy(() => import('./ShadowITDiscovery'));
const DataExposure = lazy(() => import('./DataExposure'));

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'inventory', label: 'Programas', icon: Package },
  { value: 'shadow-it', label: 'Programas Ocultos', icon: Eye },
  { value: 'data-exposure', label: 'Exposição de Dados', icon: FileWarning },
] as const;

export default function AssetSecurityCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'inventory';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Segurança de Ativos"
      description="Inventário de software, descoberta de Shadow IT e exposição de dados"
      icon={Package}
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
          <TabsContent value="inventory" className="mt-4">
            <SoftwareInventory />
          </TabsContent>
          <TabsContent value="shadow-it" className="mt-4">
            <ShadowITDiscovery />
          </TabsContent>
          <TabsContent value="data-exposure" className="mt-4">
            <DataExposure />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
