import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Shield, Lock, Clock, Server, Zap } from "lucide-react";

export default function RansomwareIncident() {
  const { tenant } = useTenant();

  const { data: alerts = [] } = useQuery({
    queryKey: ["ransomware-alerts", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_alerts")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .ilike("alert_type", "%ransomware%")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: quarantined = [] } = useQuery({
    queryKey: ["quarantined-agents", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, hostname, agent_version, is_isolated, isolated_at, isolation_reason")
        .eq("tenant_id", tenant!.id)
        .eq("is_isolated", true);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: indicators = [] } = useQuery({
    queryKey: ["ransomware-indicators", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_alerts")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .ilike("alert_type", "%ransomware%")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const stats = {
    totalIncidents: alerts.length,
    activeIncidents: alerts.filter((a: Record<string, unknown>) => a.status === "open" || a.status === "in_progress").length,
    quarantinedMachines: quarantined.length,
    indicators: indicators.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Lock className="h-6 w-6 text-red-400" /> Ransomware Kill Switch
        </h1>
        <p className="text-muted-foreground">Centro de comando para incidentes de ransomware</p>
      </div>

      {/* Status Banner */}
      {stats.activeIncidents > 0 ? (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-400 animate-pulse" />
            <div>
              <p className="font-bold text-red-400 text-lg">⚠️ {stats.activeIncidents} INCIDENTE(S) ATIVO(S)</p>
              <p className="text-sm text-muted-foreground">Máquinas em isolamento automático. Verifique os detalhes abaixo.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-green-400" />
            <div>
              <p className="font-bold text-green-400">Nenhum incidente de ransomware ativo</p>
              <p className="text-sm text-muted-foreground">Todos os endpoints estão protegidos.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <Zap className="h-6 w-6 mx-auto mb-1 text-red-400" />
          <p className="text-2xl font-bold text-foreground">{stats.totalIncidents}</p>
          <p className="text-xs text-muted-foreground">Total de Incidentes</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <AlertTriangle className="h-6 w-6 mx-auto mb-1 text-yellow-400" />
          <p className="text-2xl font-bold text-yellow-400">{stats.activeIncidents}</p>
          <p className="text-xs text-muted-foreground">Ativos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <Server className="h-6 w-6 mx-auto mb-1 text-orange-400" />
          <p className="text-2xl font-bold text-orange-400">{stats.quarantinedMachines}</p>
          <p className="text-xs text-muted-foreground">Máquinas Isoladas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <Clock className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground">{stats.indicators}</p>
          <p className="text-xs text-muted-foreground">Indicadores Detectados</p>
        </CardContent></Card>
      </div>

      {/* Quarantined Agents */}
      {quarantined.length > 0 && (
        <Card className="border-orange-500/30">
          <CardHeader><CardTitle className="text-orange-400 flex items-center gap-2">
            <Lock className="h-4 w-4" /> Máquinas em Quarentena
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Isolado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarantined.map((a: Record<string, unknown>) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.hostname}</TableCell>
                    <TableCell>{a.agent_version}</TableCell>
                    <TableCell className="text-sm">{a.isolation_reason || "Ransomware detectado"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.isolated_at ? new Date(a.isolated_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Incident History */}
      <Card>
        <CardHeader><CardTitle>Histórico de Incidentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum incidente de ransomware registrado
                </TableCell></TableRow>
              ) : alerts.map((alert: any) => (
                <TableRow key={alert.id}>
                  <TableCell>{alert.title}</TableCell>
                  <TableCell>
                    <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                      {alert.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={alert.status === "open" ? "destructive" : "outline"}>
                      {alert.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(alert.created_at).toLocaleString("pt-BR")}
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
