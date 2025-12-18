import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, HeartPulse, AlertTriangle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import AgentInstaller from "../AgentInstaller";
import InstallationHealthOverview from "./InstallationHealthOverview";
import InstallationLogsExplorer from "./InstallationLogsExplorer";

const Installations = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'installer';

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Central de Instalações</h1>
        <p className="text-muted-foreground">
          Instale novos agentes e monitore a saúde do processo
        </p>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="installer">
            <Package className="h-4 w-4 mr-2" />
            Instalar Agentes
          </TabsTrigger>
          <TabsTrigger value="health">
            <HeartPulse className="h-4 w-4 mr-2" />
            Saúde das Instalações
          </TabsTrigger>
          <TabsTrigger value="logs">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Falhas e Logs
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
