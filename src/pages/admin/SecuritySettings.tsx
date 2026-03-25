import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Key, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const SecurityKeysManager = lazy(() =>
  import('@/components/security/SecurityKeysManager').then((m) => ({
    default: m.SecurityKeysManager,
  }))
);
const TokenAlerts = lazy(() =>
  import('@/components/dashboard/TokenAlerts').then((m) => ({
    default: m.TokenAlerts,
  }))
);
const DriftDashboard = lazy(() =>
  import('@/components/compliance/DriftDashboard').then((m) => ({
    default: m.DriftDashboard,
  }))
);

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'keys', label: 'Chaves de Segurança', icon: Shield },
  { value: 'tokens', label: 'Tokens de API', icon: Key },
  { value: 'compliance', label: 'Compliance', icon: TrendingDown },
] as const;

export default function SecuritySettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'keys';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Configurações de Segurança"
      description="Chaves FIDO2, tokens de API e compliance em um só lugar"
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
          <TabsContent value="keys" className="mt-4 space-y-6">
            <SecurityKeysManager />
          </TabsContent>
          <TabsContent value="tokens" className="mt-4 space-y-6">
            <TokenAlerts />
          </TabsContent>
          <TabsContent value="compliance" className="mt-4 space-y-6">
            <DriftDashboard />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
