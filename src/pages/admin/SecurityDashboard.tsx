import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, Activity, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SecurityLog {
  id: string;
  created_at: string;
  ip_address: string;
  endpoint: string;
  attack_type: string;
  severity: string;
  blocked: boolean;
  details: any;
  user_agent: string;
}

export default function SecurityDashboard() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['security-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as SecurityLog[];
    },
    refetchInterval: 10000, // Auto-refresh a cada 10 segundos
  });

  const { data: stats } = useQuery({
    queryKey: ['security-stats'],
    queryFn: async () => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const [totalResult, criticalResult, blockedResult, uniqueIpsResult] = await Promise.all([
        supabase.from('security_logs').select('*', { count: 'exact', head: true }).gte('created_at', last24h),
        supabase.from('security_logs').select('*', { count: 'exact', head: true }).eq('severity', 'critical').gte('created_at', last24h),
        supabase.from('security_logs').select('*', { count: 'exact', head: true }).eq('blocked', true).gte('created_at', last24h),
        supabase.from('security_logs').select('ip_address').gte('created_at', last24h),
      ]);

      const uniqueIps = new Set((uniqueIpsResult.data || []).map(l => l.ip_address)).size;

      return {
        total: totalResult.count || 0,
        critical: criticalResult.count || 0,
        blocked: blockedResult.count || 0,
        uniqueIps,
      };
    },
    refetchInterval: 10000,
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getAttackTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sql_injection: 'SQL Injection',
      xss: 'XSS',
      path_traversal: 'Path Traversal',
      rate_limit: 'Rate Limit',
      invalid_input: 'Entrada Inválida',
      brute_force: 'Força Bruta',
      unauthorized: 'Não Autorizado',
      control_characters: 'Caracteres de Controle',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard de Segurança</h1>
        <p className="text-muted-foreground">
          Monitoramento em tempo real de tentativas de ataque e validações de segurança
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Eventos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Últimas 24 horas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ataques Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.critical || 0}</div>
            <p className="text-xs text-muted-foreground">Requerem atenção imediata</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bloqueados</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.blocked || 0}</div>
            <p className="text-xs text-muted-foreground">Tentativas bloqueadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IPs Únicos</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.uniqueIps || 0}</div>
            <p className="text-xs text-muted-foreground">Endereços diferentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Critical Events */}
      {logs && logs.filter(l => l.severity === 'critical').length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção: Eventos Críticos Detectados</AlertTitle>
          <AlertDescription>
            {logs.filter(l => l.severity === 'critical').length} evento(s) crítico(s) detectado(s) recentemente.
            Revise imediatamente a tabela abaixo.
          </AlertDescription>
        </Alert>
      )}

      {/* Security Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Logs de Segurança</CardTitle>
          <CardDescription>
            Tentativas de ataque e validações falhadas (atualiza a cada 10 segundos)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando logs de segurança...
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Nenhum evento de segurança registrado</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Tipo de Ataque</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getAttackTypeLabel(log.attack_type)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.ip_address}</TableCell>
                      <TableCell>
                        <Badge variant={getSeverityColor(log.severity) as any}>
                          {log.severity.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.blocked ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <Ban className="h-3 w-3 mr-1" />
                            Bloqueado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            Permitido
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
