import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Shield, Ban, Clock, RefreshCw, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

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
        console.warn('Rate limit stats response is empty or invalid:', data);
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
    refetchInterval: 30000, // Auto-refresh every 30 seconds
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
              <SelectItem value="1">Last 1 hour</SelectItem>
              <SelectItem value="6">Last 6 hours</SelectItem>
              <SelectItem value="12">Last 12 hours</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="48">Last 48 hours</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* No Data Alert */}
        {hasNoData && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Nenhum dado de rate limiting encontrado</AlertTitle>
            <AlertDescription>
              Ainda não há dados de rate limiting no período selecionado. Isso é normal se o sistema foi recém-implantado ou não há tráfego recente nas APIs protegidas.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{data?.totals.total_requests.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Blocked Requests</CardTitle>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Endpoints</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{data?.totals.unique_endpoints}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Currently Blocked</CardTitle>
              <Shield className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-warning">{data?.totals.currently_blocked}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Requests by Endpoint</CardTitle>
            <CardDescription>Top endpoints by request volume</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))' 
                    }}
                  />
                  <Legend />
                  <Bar dataKey="requests" fill="hsl(var(--primary))" name="Requests" />
                  <Bar dataKey="blocked" fill="hsl(var(--destructive))" name="Blocked" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Endpoint Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Endpoint Summary</CardTitle>
              <CardDescription>Request statistics by endpoint</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Blocked</TableHead>
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
              <CardTitle>Currently Blocked</CardTitle>
              <CardDescription>Identifiers currently rate-limited</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : data?.top_blocked.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No identifiers currently blocked</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identifier</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Until</TableHead>
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
                            {new Date(row.blocked_until).toLocaleTimeString()}
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
