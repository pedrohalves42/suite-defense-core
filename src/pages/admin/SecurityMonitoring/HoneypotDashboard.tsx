import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useHoneypotStats, useHoneypotRecentInteractions, useHoneypotHourlyStats } from '@/hooks/useHoneypotData';
import { Shield, Globe, AlertTriangle, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

function classificationVariant(c: string | null) {
  switch (c) {
    case 'malicious': return 'destructive';
    case 'suspicious': return 'secondary';
    case 'reconnaissance': return 'outline';
    default: return 'default';
  }
}

export function HoneypotDashboard() {
  const { data: stats, isLoading: statsLoading } = useHoneypotStats();
  const { data: interactions, isLoading: interactionsLoading } = useHoneypotRecentInteractions(30);
  const { data: hourlyStats } = useHoneypotHourlyStats(7);

  const chartData = (hourlyStats ?? []).map((h) => ({
    time: new Date(h.hour_start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    total: h.interaction_count,
    malicious: h.malicious_count,
    suspicious: h.suspicious_count,
  }));

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interações (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '...' : stats?.total_interactions ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IPs Únicos</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '...' : stats?.unique_ip_hashes ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maliciosos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {statsLoading ? '...' : stats?.classifications?.['malicious'] ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspeitos</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '...' : stats?.classifications?.['suspicious'] ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart — based on aggregated hourly stats, not raw data */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Volume por Hora (7 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <XAxis dataKey="time" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} tickLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="hsl(var(--primary))" name="Total" />
                <Bar dataKey="malicious" fill="hsl(var(--destructive))" name="Maliciosos" />
                <Bar dataKey="suspicious" fill="hsl(var(--muted-foreground))" name="Suspeitos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent interactions — limited to 30 rows, paginated later */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Últimas Interações</CardTitle>
        </CardHeader>
        <CardContent>
          {interactionsLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modo</TableHead>
                  <TableHead>IP Prefix</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(interactions ?? []).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Badge variant={i.mode === 'flipped' ? 'destructive' : 'outline'}>{i.mode}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.source_ip_prefix ?? '-'}</TableCell>
                    <TableCell>{i.method ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">{i.path ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={classificationVariant(i.classification) as 'default' | 'destructive' | 'outline' | 'secondary'}>
                        {i.classification ?? 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell>{i.status_code ?? '-'}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
