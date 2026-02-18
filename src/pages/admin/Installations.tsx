import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, HeartPulse, AlertTriangle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import AgentInstaller from "../AgentInstaller";
import InstallationHealthOverview from "./InstallationHealthOverview";
import InstallationLogsExplorer from "./InstallationLogsExplorer";
import { useTranslation } from 'react-i18next';

const Installations = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'installer';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {t('adminPages.installations.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('adminPages.installations.subtitle')}
          </p>
        </div>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="installer">
            <Package className="h-4 w-4 mr-2" />
            {t('adminPages.installations.installAgents')}
          </TabsTrigger>
          <TabsTrigger value="health">
            <HeartPulse className="h-4 w-4 mr-2" />
            {t('adminPages.installations.installationHealth')}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <AlertTriangle className="h-4 w-4 mr-2" />
            {t('adminPages.installations.failuresAndLogs')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installer" className="space-y-4">
          <AgentInstaller />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <InstallationHealthOverview />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <InstallationLogsExplorer />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Installations;
