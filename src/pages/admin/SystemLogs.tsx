import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, Mail, Activity } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SystemLogs() {
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['system-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  const { data: securityLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['security-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
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
          Histórico de execuções de cron jobs, alertas e eventos de segurança
        </p>
      </div>

      {/* System Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Alertas do Sistema
          </CardTitle>
          <CardDescription>
            Alertas gerados automaticamente pelo sistema de monitoramento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {alerts && alerts.length > 0 ? (
              alerts.map((alert) => (
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
                        {format(new Date(alert.created_at), "dd/MM/yyyy HH:mm:ss", {
                          locale: ptBR,
                        })}
                      </div>
                      {alert.resolved_at && (
                        <div className="text-xs mt-1">
                          Resolvido em{" "}
                          {format(new Date(alert.resolved_at), "dd/MM HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                      )}
                      {alert.email_sent_at && (
                        <div className="text-xs mt-1">
                          Email em{" "}
                          {format(new Date(alert.email_sent_at), "dd/MM HH:mm", {
                            locale: ptBR,
                          })}
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

      {/* Security Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Logs de Segurança
          </CardTitle>
          <CardDescription>
            Eventos de segurança e tentativas de ataque detectadas
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
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", {
                        locale: ptBR,
                      })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum evento de segurança registrado
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
