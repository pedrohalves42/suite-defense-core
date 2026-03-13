import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cpu, Users, Tag, Clock, GitBranch, Archive } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy-load each tab's content from the existing pages
const AgentHealthMonitor = lazy(() => import('./AgentHealthMonitor'));
const AgentGroups = lazy(() => import('./AgentGroups'));
const AgentTags = lazy(() => import('./AgentTags'));
const AgentTimeline = lazy(() => import('./AgentTimeline'));
const AgentVersionMonitor = lazy(() => import('./AgentVersionMonitor'));
const ArchivedAgents = lazy(() => import('./ArchivedAgents'));

const TabLoader = () => (
  <div className="space-y-4 py-8">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: 'health', label: 'Computadores', icon: Cpu },
  { value: 'groups', label: 'Grupos', icon: Users },
  { value: 'tags', label: 'Etiquetas', icon: Tag },
  { value: 'timeline', label: 'Histórico', icon: Clock },
  { value: 'versions', label: 'Versões', icon: GitBranch },
  { value: 'archived', label: 'Inativos', icon: Archive },
] as const;

export default function AgentCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'health';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout
      title="Central de Computadores"
      description="Gerencie todos os endpoints, grupos, etiquetas e versões em um só lugar"
      icon={Cpu}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 bg-secondary h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="text-xs sm:text-sm gap-1.5">
              <Icon className="h-3.5 w-3.5 hidden sm:inline" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Suspense fallback={<TabLoader />}>
          <TabsContent value="health" className="mt-4">
            <AgentHealthMonitor />
          </TabsContent>
          <TabsContent value="groups" className="mt-4">
            <AgentGroups />
          </TabsContent>
          <TabsContent value="tags" className="mt-4">
            <AgentTags />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <AgentTimeline />
          </TabsContent>
          <TabsContent value="versions" className="mt-4">
            <AgentVersionMonitor />
          </TabsContent>
          <TabsContent value="archived" className="mt-4">
            <ArchivedAgents />
          </TabsContent>
        </Suspense>
      </Tabs>
    </AdminPageLayout>
  );
}
