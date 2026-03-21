import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Clock, Mail, Activity, Shield, Filter } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { RecentAuditActivity } from "@/components/admin/RecentAuditActivity";
import { toast } from "sonner";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SystemLogs() {
  const { tenant, loading: tenantLoading } = useTenant();
  const { isSuperAdmin } = useSuperAdmin();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['system-alerts', tenant?.id],
    queryFn: async () => {
      let query = supabase
        .from('system_alerts')
        .select('id, tenant_id, title, message, severity, alert_type, source, status, acknowledged, acknowledged_at, resolved_at, created_at');
      
      // Filter by tenant if not super admin
      if (!isSuperAdmin && tenant?.id) {
        query = query.eq('tenant_id', tenant.id);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data;
    },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('No tenant ID');
      
      const { data, error } = await supabase.rpc('acknowledge_all_alerts', {
        p_tenant_id: tenant.id
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data: { acknowledged_count: number }) => {
      toast.success(`${data.acknowledged_count} alertas reconhecidos com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] });
    },
    onError: (error) => {
      toast.error('Erro ao reconhecer alertas: ' + error.message);
    },
  });

  const { data: securityLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['security-logs', tenant?.id],
    queryFn: async () => {
      let query = supabase
        .from('security_logs')
        .select('id, tenant_id, attack_type, severity, ip_address, endpoint, blocked, created_at');
      
      // Filter by tenant if not super admin
      if (!isSuperAdmin && tenant?.id) {
        query = query.eq('tenant_id', tenant.id);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  const getSeverityBadge = (severity: string) => {
    const variants = {
      low: 'default',
      medium: 'secondary',
      high: 'destructive',
      critical: 'destructive'
    } as const;
    
    return (
      <Badge variant={variants[severity as keyof typeof variants] || 'default'}>
        {severity}
      </Badge>
    );
  };

  const getAlertTypeBadge = (type: string) => {
    const icons = {
      pending_agents: <Clock className="h-3 w-3 mr-1" />,
      email_sent: <Mail className="h-3 w-3 mr-1" />,
      cron_execution: <Activity className="h-3 w-3 mr-1" />
    };

    return (
      <Badge variant="outline" className="flex items-center gap-1">
        {icons[type as keyof typeof icons]}
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  // Filter alerts
  const filteredAlerts = alerts?.filter((alert) => {
    if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
    if (typeFilter !== "all" && alert.alert_type !== typeFilter) return false;
    return true;
  });

  // Alert statistics
  const alertStats = alerts?.reduce((acc, alert) => {
    if (!alert.resolved) {
      acc.unresolved++;
      if (alert.severity === 'critical') acc.critical++;
      if (alert.severity === 'high') acc.high++;
    }
    return acc;
  }, { unresolved: 0, critical: 0, high: 0 });

  if (alertsLoading || logsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logs do Sistema</h1>
        <p className="text-muted-foreground">
          Historico de execucoes de cron jobs, alertas e eventos de seguranca
        </p>
      </div>

      {/* System Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Alertas do Sistema
              </CardTitle>
              <CardDescription>
                Alertas gerados automaticamente pelo sistema de monitoramento
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={!alertStats?.unresolved || acknowledgeAllMutation.isPending}
              >
                {acknowledgeAllMutation.isPending ? "Processando..." : "Reconhecer Todos"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Statistics */}
          {alertStats && alertStats.unresolved > 0 && (
            <div className="mb-4 p-4 bg-muted rounded-lg flex gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{alertStats.unresolved}</Badge>
                <span className="text-sm">Não resolvidos</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{alertStats.critical}</Badge>
                <span className="text-sm">Críticos</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{alertStats.high}</Badge>
                <span className="text-sm">Alta prioridade</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-4 flex gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por severidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas severidades</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="high_cpu">CPU Alta</SelectItem>
                <SelectItem value="high_memory">Memória Alta</SelectItem>
                <SelectItem value="high_disk">Disco Alto</SelectItem>
                <SelectItem value="pending_agents">Agentes Pendentes</SelectItem>
                <SelectItem value="email_sent">Email Enviado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-4">
            {filteredAlerts && filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        {getAlertTypeBadge(alert.alert_type)}
                        {getSeverityBadge(alert.severity)}
                        {alert.resolved && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Resolvido
                          </Badge>
                        )}
                        {alert.email_sent && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            Email enviado
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold">{alert.title}</h4>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                      {alert.details && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">
                            Ver detalhes
                          </summary>
                          <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">
                            {JSON.stringify(alert.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground ml-4">
                      <div>
                        {formatBrazilDateTime(alert.created_at, 'full')}
                      </div>
                      {alert.resolved_at && (
                        <div className="text-xs mt-1">
                          Resolvido em {formatBrazilDateTime(alert.resolved_at, 'short')}
                        </div>
                      )}
                      {alert.email_sent_at && (
                        <div className="text-xs mt-1">
                          Email em {formatBrazilDateTime(alert.email_sent_at, 'short')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum alerta registrado
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Logs de Auditoria
          </CardTitle>
          <CardDescription>
            Acoes de usuarios e eventos de sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentAuditActivity tenantId={tenant?.id} loading={tenantLoading} />
        </CardContent>
      </Card>

      {/* Security Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Logs de Seguranca
          </CardTitle>
          <CardDescription>
            Eventos de seguranca e tentativas de ataque detectadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {securityLogs && securityLogs.length > 0 ? (
              securityLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{log.attack_type}</Badge>
                        {getSeverityBadge(log.severity)}
                        {log.blocked && (
                          <Badge variant="destructive">Bloqueado</Badge>
                        )}
                      </div>
                      <h4 className="font-semibold">{log.endpoint}</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>IP: {log.ip_address}</div>
                        {log.user_agent && (
                          <div className="text-xs truncate max-w-2xl">
                            User Agent: {log.user_agent}
                          </div>
                        )}
                      </div>
                      {log.details && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">
                            Ver detalhes
                          </summary>
                          <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground ml-4">
                      {formatBrazilDateTime(log.created_at, 'full')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum evento de seguranca registrado
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
