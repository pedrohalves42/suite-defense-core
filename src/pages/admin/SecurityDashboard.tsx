import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, Activity, Ban, Unlock, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface BlockedIP {
  id: string;
  ip_address: string;
  blocked_until: string;
  reason: string;
  created_at: string;
}

interface FailedAttempt {
  id: string;
  ip_address: string;
  email: string | null;
  created_at: string;
  user_agent: string;
}

export default function SecurityDashboard() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useSuperAdmin();

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
    refetchInterval: 10000,
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

  const { data: blockedIPs } = useQuery({
    queryKey: ['blocked-ips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ip_blocklist')
        .select('*')
        .gte('blocked_until', new Date().toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BlockedIP[];
    },
    refetchInterval: 10000,
    enabled: isSuperAdmin,
  });

  const { data: failedAttempts } = useQuery({
    queryKey: ['failed-attempts'],
    queryFn: async () => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('failed_login_attempts')
        .select('*')
        .gte('created_at', last24h)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as FailedAttempt[];
    },
    refetchInterval: 10000,
    enabled: isSuperAdmin,
  });

  const unblockIPMutation = useMutation({
    mutationFn: async (ipAddress: string) => {
      const { error } = await supabase
        .from('ip_blocklist')
        .delete()
        .eq('ip_address', ipAddress);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-ips'] });
      toast.success('IP desbloqueado com sucesso');
    },
    onError: (error: any) => {
      toast.error(`Erro ao desbloquear IP: ${error.message}`);
    },
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

      {/* Critical Events Alert */}
      {logs && logs.filter(l => l.severity === 'critical').length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção: Eventos Críticos Detectados</AlertTitle>
          <AlertDescription>
            {logs.filter(l => l.severity === 'critical').length} evento(s) crítico(s) detectado(s) recentemente.
            Revise imediatamente as tabelas abaixo.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">
            <Shield className="h-4 w-4 mr-2" />
            Logs de Segurança
          </TabsTrigger>
          {isSuperAdmin && (
            <>
              <TabsTrigger value="blocked">
                <Ban className="h-4 w-4 mr-2" />
                IPs Bloqueados ({blockedIPs?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="attempts">
                <User className="h-4 w-4 mr-2" />
                Tentativas Falhadas ({failedAttempts?.length || 0})
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Security Logs Tab */}
        <TabsContent value="logs">
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
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400">
                                <Ban className="h-3 w-3 mr-1" />
                                Bloqueado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400">
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
        </TabsContent>

        {/* Blocked IPs Tab (Super Admin Only) */}
        {isSuperAdmin && (
          <TabsContent value="blocked">
            <Card>
              <CardHeader>
                <CardTitle>IPs Bloqueados</CardTitle>
                <CardDescription>
                  Endereços IP temporariamente bloqueados por tentativas de ataque
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!blockedIPs || blockedIPs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>Nenhum IP bloqueado no momento</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IP</TableHead>
                          <TableHead>Bloqueado em</TableHead>
                          <TableHead>Expira em</TableHead>
                          <TableHead>Motivo</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {blockedIPs.map((block) => (
                          <TableRow key={block.id}>
                            <TableCell className="font-mono text-sm font-semibold">
                              {block.ip_address}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {format(new Date(block.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {format(new Date(block.blocked_until), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{block.reason}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => unblockIPMutation.mutate(block.ip_address)}
                                disabled={unblockIPMutation.isPending}
                              >
                                <Unlock className="h-3 w-3 mr-1" />
                                Desbloquear
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Failed Login Attempts Tab (Super Admin Only) */}
        {isSuperAdmin && (
          <TabsContent value="attempts">
            <Card>
              <CardHeader>
                <CardTitle>Tentativas de Login Falhadas</CardTitle>
                <CardDescription>
                  Tentativas de login que falharam nas últimas 24 horas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!failedAttempts || failedAttempts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>Nenhuma tentativa falhada registrada</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>User Agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {failedAttempts.map((attempt) => (
                          <TableRow key={attempt.id}>
                            <TableCell className="font-mono text-xs">
                              {format(new Date(attempt.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-mono text-sm font-semibold">
                              {attempt.ip_address}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {attempt.email || <span className="text-muted-foreground">N/A</span>}
                            </TableCell>
                            <TableCell className="text-xs max-w-xs truncate" title={attempt.user_agent}>
                              {attempt.user_agent}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
