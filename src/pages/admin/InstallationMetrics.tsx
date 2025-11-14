import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

const COLORS = {
  success: '#10b981',
  failed: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6'
};

interface InstallationData {
  success?: boolean;
  installation_time_seconds?: number;
  error_message?: string;
  event_type: string;
  created_at: string;
  platform: string;
  metadata?: any;
}

export default function InstallationMetrics() {
  const { toast } = useToast();

  const { data: installations, isLoading } = useQuery({
    queryKey: ['installation-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_analytics')
        .select('*')
        .eq('event_type', 'post_installation')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        toast({
          title: "Erro ao carregar métricas",
          description: error.message,
          variant: "destructive"
        });
        throw error;
      }

      return data as InstallationData[];
    }
  });

  // Cálculo das métricas principais
  const totalInstallations = installations?.length || 0;
  const successfulInstallations = installations?.filter(i => i.success === true).length || 0;
  const failedInstallations = installations?.filter(i => i.success === false).length || 0;
  
  const successRate = totalInstallations > 0
    ? ((successfulInstallations / totalInstallations) * 100).toFixed(1)
    : '0';

  const avgInstallTime = installations && installations.length > 0
    ? (installations
        .filter(i => i.installation_time_seconds && i.installation_time_seconds > 0)
        .reduce((acc, curr) => acc + (curr.installation_time_seconds || 0), 0) / 
        installations.filter(i => i.installation_time_seconds && i.installation_time_seconds > 0).length || 1
      ).toFixed(1)
    : '0';

  // Distribuição de erros
  const errorDistribution: Record<string, number> = {};
  installations?.filter(i => !i.success && i.error_message).forEach(i => {
    const errorKey = i.error_message || 'Erro desconhecido';
    errorDistribution[errorKey] = (errorDistribution[errorKey] || 0) + 1;
  });

  const errorData = Object.entries(errorDistribution)
    .map(([name, value]) => ({ name: name.substring(0, 50), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Taxa de sucesso por plataforma
  const platformSuccess = installations?.reduce((acc, curr) => {
    const platform = curr.platform || 'unknown';
    if (!acc[platform]) {
      acc[platform] = { total: 0, success: 0 };
    }
    acc[platform].total++;
    if (curr.success) acc[platform].success++;
    return acc;
  }, {} as Record<string, { total: number; success: number }>);

  const platformData = Object.entries(platformSuccess || {}).map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    taxa: ((stats.success / stats.total) * 100).toFixed(1),
    sucessos: stats.success,
    falhas: stats.total - stats.success
  }));

  // Tendência temporal (últimos 30 dias)
  const timelineData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const dateStr = date.toISOString().split('T')[0];
    
    const dayInstalls = installations?.filter(a => 
      a.created_at.startsWith(dateStr)
    ) || [];

    const successful = dayInstalls.filter(i => i.success).length;
    const failed = dayInstalls.filter(i => !i.success).length;
    const total = dayInstalls.length;

    return {
      date: dateStr,
      taxa: total > 0 ? ((successful / total) * 100).toFixed(0) : '0',
      sucessos: successful,
      falhas: failed
    };
  });

  // Dados para o gráfico de pizza
  const successPieData = [
    { name: 'Sucesso', value: successfulInstallations, color: COLORS.success },
    { name: 'Falha', value: failedInstallations, color: COLORS.failed }
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Métricas de Instalação</h1>
          <p className="text-muted-foreground">
            Análise detalhada de taxa de sucesso, tempo médio e distribuição de erros
          </p>
        </div>
        <Activity className="h-8 w-8 text-primary" />
      </div>

      {/* Cards de métricas principais */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            {parseFloat(successRate) >= 80 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {successfulInstallations} de {totalInstallations} instalações
            </p>
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">{successfulInstallations} sucessos</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Instalação</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgInstallTime}s</div>
            <p className="text-xs text-muted-foreground">
              Média de tempo por instalação
            </p>
            <div className="mt-2 text-sm text-muted-foreground">
              {parseFloat(avgInstallTime) < 60 
                ? "Excelente performance" 
                : "Pode necessitar otimização"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instalações com Falha</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedInstallations}</div>
            <p className="text-xs text-muted-foreground">
              {((failedInstallations / totalInstallations) * 100).toFixed(1)}% do total
            </p>
            <div className="mt-2 text-sm text-muted-foreground">
              {failedInstallations === 0 
                ? "Nenhuma falha registrada" 
                : `${errorData.length} tipos de erro diferentes`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Taxa de Sucesso Visual */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Resultados</CardTitle>
            <CardDescription>Proporção entre instalações bem-sucedidas e falhas</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={successPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {successPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Taxa de Sucesso por Plataforma */}
        <Card>
          <CardHeader>
            <CardTitle>Taxa de Sucesso por Plataforma</CardTitle>
            <CardDescription>Comparação de performance entre sistemas operacionais</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="sucessos" fill={COLORS.success} name="Sucessos" />
                <Bar dataKey="falhas" fill={COLORS.failed} name="Falhas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição de Erros */}
      {errorData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 - Distribuição de Erros</CardTitle>
            <CardDescription>
              Erros mais frequentes durante o processo de instalação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={errorData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={200} />
                <Tooltip />
                <Bar dataKey="value" fill={COLORS.failed} name="Ocorrências" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tendência Temporal */}
      <Card>
        <CardHeader>
          <CardTitle>Tendência de Taxa de Sucesso (Últimos 30 Dias)</CardTitle>
          <CardDescription>
            Evolução da taxa de sucesso ao longo do tempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="taxa" 
                stroke={COLORS.info} 
                name="Taxa de Sucesso (%)" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
