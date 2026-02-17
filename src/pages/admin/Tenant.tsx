import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Shield, ScrollText, Settings } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import TenantInvites from "./tenant/TenantInvites";
import TenantSecurity from "./tenant/TenantSecurity";
import TenantLogs from "./tenant/TenantLogs";
import TenantSettings from "./tenant/TenantSettings";

const Tenant = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'invites';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Gerenciar Tenant
          </h2>
          <p className="text-sm text-muted-foreground">
            Configurações e monitoramento completo do tenant
          </p>
        </div>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="invites">
            <Mail className="h-4 w-4 mr-2" />
            Convites
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Seguranca
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Configuracoes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invites" className="space-y-4">
          <TenantInvites />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <TenantSecurity />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <TenantLogs />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <TenantSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Tenant;
