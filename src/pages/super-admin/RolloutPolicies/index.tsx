import { Percent, AlertTriangle, RefreshCw, Activity, RotateCcw, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRolloutPolicies } from "./useRolloutPolicies";
import { PlatformCards } from "./PlatformCards";
import { RolloutTelemetryDashboard } from "./RolloutTelemetryDashboard";
import { RollbackEventsDashboard } from "./RollbackEventsDashboard";
import { AgentRolloutSimulator } from "./AgentRolloutSimulator";

export default function RolloutPolicies() {
  const {
    policies, isLoading, editingPolicy, formData, setFormData,
    saveMutation, toggleMutation,
    getPolicyForPlatform, getLatestVersionForPlatform,
    startEditing, handleSave, cancelEditing,
  } = useRolloutPolicies();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Políticas de Rollout</h1>
          <p className="text-muted-foreground">Controle gradual de deploy de updates para agentes</p>
        </div>
        <Badge variant="outline" className="text-sm">
          <AlertTriangle className="h-3 w-3 mr-1" />Super Admin Only
        </Badge>
      </div>

      {/* Explanation */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0"><Percent className="h-8 w-8 text-primary" /></div>
            <div className="space-y-2">
              <h3 className="font-semibold">Como funciona o Rollout Gradual</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Percentual:</strong> Define quantos % dos agentes receberão o update</li>
                <li>• <strong>Determinístico:</strong> O mesmo agente sempre cai no mesmo bucket (SHA256 do ID)</li>
                <li>• <strong>Kill Switch:</strong> Desligar &quot;enabled&quot; para TODOS pararem de atualizar imediatamente</li>
                <li>• <strong>Gradual:</strong> Aumente de 5% → 25% → 50% → 100% conforme valida</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <PlatformCards
        editingPolicy={editingPolicy} formData={formData} setFormData={setFormData}
        saveMutation={saveMutation} toggleMutation={toggleMutation}
        getPolicyForPlatform={getPolicyForPlatform} getLatestVersionForPlatform={getLatestVersionForPlatform}
        startEditing={startEditing} handleSave={handleSave} cancelEditing={cancelEditing}
      />

      <Tabs defaultValue="telemetry" className="space-y-4">
        <TabsList>
          <TabsTrigger value="telemetry"><Activity className="h-4 w-4 mr-2" />Telemetria de Rollout</TabsTrigger>
          <TabsTrigger value="rollbacks"><RotateCcw className="h-4 w-4 mr-2" />Eventos de Rollback</TabsTrigger>
        </TabsList>
        <TabsContent value="telemetry">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Telemetria de Rollout</CardTitle>
              <CardDescription>Histórico de decisões de update para cada agente</CardDescription>
            </CardHeader>
            <CardContent><RolloutTelemetryDashboard /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rollbacks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Eventos de Rollback</CardTitle>
              <CardDescription>Rollbacks automáticos e agentes em Safe Mode</CardDescription>
            </CardHeader>
            <CardContent><RollbackEventsDashboard /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Simulador de Rollout</CardTitle>
          <CardDescription>Veja quantos agentes seriam afetados com as configurações atuais</CardDescription>
        </CardHeader>
        <CardContent><AgentRolloutSimulator policies={policies || []} /></CardContent>
      </Card>
    </div>
  );
}
