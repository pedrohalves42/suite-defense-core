import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Shield, Ban, Clock, RefreshCw, TrendingUp, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatBrazilTime } from '@/lib/date-utils';

interface RateLimitSummary {
  endpoint: string;
  total_requests: number;
  unique_identifiers: number;
  blocked_count: number;
  avg_requests_per_identifier: number;
}

interface BlockedIdentifier {
  identifier: string;
  endpoint: string;
  request_count: number;
  blocked_until: string;
}

interface RateLimitStats {
  summary: RateLimitSummary[];
  top_blocked: BlockedIdentifier[];
  hourly_breakdown: Record<string, { hour: string; requests: number }[]>;
  totals: {
    total_requests: number;
    total_blocked: number;
    unique_endpoints: number;
    currently_blocked: number;
  };
  period_hours: number;
}

export default function RateLimitingStats() {
  const [hoursBack, setHoursBack] = useState('24');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rate-limit-stats', hoursBack],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-rate-limit-stats', {
        body: { hours_back: parseInt(hoursBack) },
      });
      
      if (error) throw error;
      
      // A Edge Function retorna { success: true, data: {...} }
      const response = data as { success?: boolean; data?: RateLimitStats } | RateLimitStats;
      
      // Verificar se é resposta encapsulada ou direta
      const stats = 'data' in response && response.data ? response.data : response as RateLimitStats;
      
      // Garantir que sempre retornamos um objeto válido
      if (!stats || !stats.totals) {
        // Rate limit stats response is empty or invalid — return defaults
        return {
          summary: [],
          top_blocked: [],
          hourly_breakdown: {},
          totals: {
            total_requests: 0,
            total_blocked: 0,
            unique_endpoints: 0,
            currently_blocked: 0,
          },
          period_hours: parseInt(hoursBack),
        } as RateLimitStats;
      }
      
      return stats;
    },
    refetchInterval: 300000,
    refetchIntervalInBackground: false, // COST-OPT: 30s → 5min
  });

  const formatEndpoint = (endpoint: string) => {
    return endpoint.replace(/^\/functions\/v1\//, '').replace(/-/g, ' ');
  };

  const chartData = data?.summary.slice(0, 8).map(s => ({
    name: formatEndpoint(s.endpoint).slice(0, 15),
    requests: s.total_requests,
    blocked: s.blocked_count,
  })) || [];

  const hasNoData = !isLoading && data?.totals.total_requests === 0;

  return (
    <AdminPageLayout 
      title="Estatísticas de Rate Limiting" 
      description="Monitoramento de limites de requisições e bloqueios da API"
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex justify-between items-center">
          <Select value={hoursBack} onValueChange={setHoursBack}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última 1 hora</SelectItem>
              <SelectItem value="6">Últimas 6 horas</SelectItem>
              <SelectItem value="12">Últimas 12 horas</SelectItem>
              <SelectItem value="24">Últimas 24 horas</SelectItem>
              <SelectItem value="48">Últimas 48 horas</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* No Data Alert */}
        {hasNoData && (
          <Alert className="border-success/50 bg-success/5">
            <Shield className="h-4 w-4 text-success" />
            <AlertTitle className="text-success">✅ Tudo tranquilo!</AlertTitle>
            <AlertDescription>
              Nenhum abuso detectado nas suas APIs no período selecionado. Seu sistema está funcionando normalmente sem tentativas de sobrecarga.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Requisições</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{data?.totals.total_requests.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Requisições Bloqueadas</CardTitle>
              <Ban className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-destructive">{data?.totals.total_blocked.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Endpoints Ativos</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{data?.totals.unique_endpoints}</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Bloqueados Agora</CardTitle>
              <Shield className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{data?.totals.currently_blocked}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Requisições por Endpoint</CardTitle>
            <CardDescription>Top endpoints por volume de requisições</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhum dado para exibir no gráfico</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === 'requests' ? 'Requisições' : 'Bloqueadas'
                    ]}
                  />
                  <Legend formatter={(value) => value === 'requests' ? 'Requisições' : 'Bloqueadas'} />
                  <Bar dataKey="requests" fill="hsl(221, 83%, 53%)" name="Requisições" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="blocked" fill="hsl(0, 72%, 51%)" name="Bloqueadas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Endpoint Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Resumo por Endpoint</CardTitle>
              <CardDescription>Estatísticas de requisições por endpoint</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : data?.summary.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum endpoint com atividade</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Requisições</TableHead>
                      <TableHead className="text-right">Bloqueadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.summary.slice(0, 10).map((row) => (
                      <TableRow key={row.endpoint}>
                        <TableCell className="font-mono text-xs">
                          {formatEndpoint(row.endpoint)}
                        </TableCell>
                        <TableCell className="text-right">{row.total_requests.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {row.blocked_count > 0 ? (
                            <Badge variant="destructive">{row.blocked_count}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Currently Blocked */}
          <Card>
            <CardHeader>
              <CardTitle>Bloqueados Atualmente</CardTitle>
              <CardDescription>Identificadores atualmente limitados</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : data?.top_blocked.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum identificador bloqueado</p>
                  <p className="text-sm mt-1">Isso é bom! Nenhum abuso detectado.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificador</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Até</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.top_blocked.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]">
                          {row.identifier.slice(0, 20)}...
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatEndpoint(row.endpoint).slice(0, 15)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatBrazilTime(row.blocked_until)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminPageLayout>
  );
}
