import React from 'react';
import SecurityMonitor from '@/components/admin/SecurityMonitor';
import RemediationReport from './RemediationReport';
import { ShieldCheck, FileText, Lock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SecurityDashboard = () => {
  return (
    <div className="container mx-auto py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Painel de Conformidade e Segurança</h1>
        <p className="text-muted-foreground">
          Gestão de remedição do Pentest e monitoramento de headers em tempo real.
        </p>
      </div>

      <Tabs defaultValue="report" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="report" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Relatório de Pentest
          </TabsTrigger>
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Monitoramento Real-time
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="report" className="mt-6">
          <RemediationReport />
        </TabsContent>
        
        <TabsContent value="monitor" className="mt-6">
          <SecurityMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SecurityDashboard;
