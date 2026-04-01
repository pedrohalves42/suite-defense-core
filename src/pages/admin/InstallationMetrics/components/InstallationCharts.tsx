import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts';

const COLORS = {
  success: 'hsl(var(--chart-2))',
  failed: 'hsl(var(--destructive))',
  info: 'hsl(var(--primary))',
  windows: 'hsl(var(--primary))',
  linux: 'hsl(var(--chart-3))',
};

interface Props {
  totalMetrics: any;
  platformMetrics: Record<string, { total: number; success: number; failed: number; avgTime: number; count: number }> | undefined;
}

export function InstallationCharts({ totalMetrics, platformMetrics }: Props) {
  const successPieData = [
    { name: 'Sucesso', value: totalMetrics?.successful_events || 0, color: COLORS.success },
    { name: 'Falha', value: totalMetrics?.failed_events || 0, color: COLORS.failed },
  ];

  const platformData = Object.entries(platformMetrics || {}).map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: stats.total,
    color: name === 'windows' ? COLORS.windows : COLORS.linux,
  }));

  const networkHealthData = [
    { name: 'Conexao OK', value: totalMetrics?.with_network || 0, color: COLORS.success },
    { name: 'Sem Conexao', value: totalMetrics?.without_network || 0, color: COLORS.failed },
  ];

  const platformChartData = Object.entries(platformMetrics || {}).map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    'Taxa de Sucesso (%)': stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0',
    'Tempo Medio (s)': stats.count > 0 ? (stats.avgTime / stats.count).toFixed(1) : '0',
    Sucessos: stats.success,
    Falhas: stats.failed,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Distribuicao de Sucesso/Falha</CardTitle>
          <CardDescription>Visao geral de todos os eventos</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={successPieData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                {successPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribuicao por Plataforma</CardTitle>
          <CardDescription>Eventos por sistema operacional</CardDescription>
        </CardHeader>
        <CardContent>
          {platformData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={platformData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                  {platformData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">Sem dados de plataforma</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saude da Rede</CardTitle>
          <CardDescription>Conectividade durante instalacoes</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={networkHealthData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                {networkHealthData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {platformChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparacao entre Plataformas</CardTitle>
            <CardDescription>Metricas detalhadas por SO</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="Taxa de Sucesso (%)" fill={COLORS.success} />
                <Bar yAxisId="right" dataKey="Tempo Medio (s)" fill={COLORS.info} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
