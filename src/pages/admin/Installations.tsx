import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, BarChart3, ScrollText, GitBranch } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import AgentInstaller from "../AgentInstaller";
import InstallationPipelineMonitor from "./InstallationPipelineMonitor";
import InstallationAnalytics from "./InstallationAnalytics";
import InstallationMetrics from "./InstallationMetrics";
import InstallationLogsExplorer from "./InstallationLogsExplorer";

const Installations = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'installer';

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerenciar Instalacoes</h1>
        <p className="text-muted-foreground">
          Central completa para monitorar e gerenciar instalacoes de agentes
        </p>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="installer">
            <Package className="h-4 w-4 mr-2" />
            Instalador
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <GitBranch className="h-4 w-4 mr-2" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Metricas
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installer" className="space-y-4">
          <AgentInstaller />
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <InstallationPipelineMonitor />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <InstallationAnalytics />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <InstallationMetrics />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <InstallationLogsExplorer />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Installations;
