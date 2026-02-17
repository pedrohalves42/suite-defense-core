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
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Central de Instalações
          </h2>
          <p className="text-sm text-muted-foreground">
            Instale novos agentes e monitore a saúde do processo
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
