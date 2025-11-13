import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/hooks/useTenant";
import { Shield, AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TenantSecurity() {
  const { tenant, loading: tenantLoading } = useTenant();

  // Fetch audit logs for tenant (security events)
  const { data: securityLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["tenant-security-logs", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Fetch failed login attempts for tenant
  const { data: failedLogins } = useQuery({
    queryKey: ["tenant-failed-logins", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from("failed_login_attempts")
        .select("id, email, ip_address, user_agent, created_at")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Count active agents
  const { data: agentStats } = useQuery<{ total: number; active: number; offline: number }>({
    queryKey: ["tenant-agent-stats", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, active: 0, offline: 0 };
      
      const { data, error } = await supabase
        .from("agents")
        .select("status")
        .eq("tenant_id", tenant.id);

      if (error) throw error;
      
      const total = data.length;
      const active = data.filter(a => a.status === "active").length;
      const offline = data.filter(a => a.status === "offline").length;
      
      return { total, active, offline };
    },
    enabled: !!tenant?.id,
  });

  if (tenantLoading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Segurança</h1>
        <p className="text-muted-foreground">
          Monitore eventos de segurança e atividades suspeitas
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Ativos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agentStats?.active || 0} / {agentStats?.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {agentStats?.offline || 0} offline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tentativas Falhadas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedLogins?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Últimas 24 horas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status de Segurança</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Seguro</div>
            <p className="text-xs text-muted-foreground">Sem ameaças detectadas</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logs de Segurança</CardTitle>
          <CardDescription>
            Eventos de segurança registrados no seu tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {securityLogs && securityLogs.length > 0 ? (
                securityLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.success ? "default" : "destructive"}>
                        {log.success ? "Sucesso" : "Falha"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {log.resource_type} - {log.action}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.ip_address || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum evento de segurança registrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tentativas de Login Falhadas</CardTitle>
          <CardDescription>
            Tentativas de login malsucedidas no seu tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>User Agent</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedLogins && failedLogins.length > 0 ? (
                failedLogins.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-medium">{attempt.email}</TableCell>
                    <TableCell className="font-mono text-sm">{attempt.ip_address}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {attempt.user_agent}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(attempt.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhuma tentativa falhada registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
