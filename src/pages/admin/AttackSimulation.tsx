import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Crosshair, Play, Shield, AlertTriangle, CheckCircle, XCircle, Target, Zap } from "lucide-react";

const simTypes = [
  { value: "eicar_test", label: "EICAR Test (Antivírus)", icon: Shield, desc: "Testa se o antivírus detecta o arquivo de teste padrão EICAR" },
  { value: "firewall_test", label: "Firewall Test", icon: Shield, desc: "Verifica se o firewall está ativo e bloqueando conexões" },
  { value: "canary_file_test", label: "Canary File Test", icon: Target, desc: "Cria arquivos canário e monitora acessos não autorizados" },
  { value: "usb_policy_test", label: "USB Policy Test", icon: Zap, desc: "Verifica se políticas de USB estão sendo aplicadas" },
  { value: "dns_filter_test", label: "DNS Filter Test", icon: AlertTriangle, desc: "Testa se o filtro DNS está bloqueando domínios maliciosos" },
];

export default function AttackSimulation() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState("eicar_test");

  const { data: simulations = [], isLoading } = useQuery({
    queryKey: ["attack-simulations", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attack_simulations")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const runSimulation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("run-attack-simulation", {
        body: { tenant_id: tenant!.id, simulation_type: selectedType },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Simulação iniciada! Os resultados aparecerão em alguns minutos.");
      queryClient.invalidateQueries({ queryKey: ["attack-simulations"] });
    },
    onError: () => toast.error("Erro ao iniciar simulação"),
  });

  const latestByType = simTypes.map((t) => {
    const latest = simulations.find((s: any) => s.simulation_type === t.value && s.status === "completed");
    return { ...t, latest };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Crosshair className="h-6 w-6 text-primary" /> Attack Simulation
          </h1>
          <p className="text-muted-foreground">Execute ataques simulados para validar suas defesas</p>
        </div>
      </div>

      {/* Simulation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {latestByType.map((sim) => {
          const Icon = sim.icon;
          const rate = sim.latest?.detection_rate ?? null;
          return (
            <Card key={sim.value} className={`cursor-pointer transition-all ${selectedType === sim.value ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedType(sim.value)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" /> {sim.label}
                </CardTitle>
                <CardDescription className="text-xs">{sim.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {rate !== null ? (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Taxa de Detecção</span>
                      <span className={rate >= 80 ? "text-green-400" : rate >= 50 ? "text-yellow-400" : "text-red-400"}>
                        {rate}%
                      </span>
                    </div>
                    <Progress value={rate} className="h-2" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum teste executado</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Run Button */}
      <Card>
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">
              Executar: {simTypes.find((t) => t.value === selectedType)?.label}
            </p>
            <p className="text-sm text-muted-foreground">
              O teste será executado em todos os agentes online da frota
            </p>
          </div>
          <Button onClick={() => runSimulation.mutate()} disabled={runSimulation.isPending} size="lg">
            <Play className="mr-2 h-4 w-4" />
            {runSimulation.isPending ? "Iniciando..." : "Executar Simulação"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Simulações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agentes</TableHead>
                <TableHead>Detectados</TableHead>
                <TableHead>Taxa</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : simulations.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma simulação executada</TableCell></TableRow>
              ) : simulations.map((sim: any) => (
                <TableRow key={sim.id}>
                  <TableCell>{simTypes.find((t) => t.value === sim.simulation_type)?.label || sim.simulation_type}</TableCell>
                  <TableCell>
                    <Badge variant={sim.status === "completed" ? "default" : sim.status === "running" ? "secondary" : "outline"}>
                      {sim.status === "completed" && <CheckCircle className="mr-1 h-3 w-3" />}
                      {sim.status === "running" && <Play className="mr-1 h-3 w-3 animate-pulse" />}
                      {sim.status === "failed" && <XCircle className="mr-1 h-3 w-3" />}
                      {sim.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{sim.total_agents}</TableCell>
                  <TableCell>{sim.detected_count}/{sim.total_agents}</TableCell>
                  <TableCell>
                    <span className={Number(sim.detection_rate) >= 80 ? "text-green-400" : Number(sim.detection_rate) >= 50 ? "text-yellow-400" : "text-red-400"}>
                      {sim.detection_rate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(sim.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
