import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
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
} from 'recharts';

const COLORS = {
  active: '#10b981',
  trialing: '#3b82f6',
  canceled: '#ef4444',
  past_due: '#f59e0b',
};

interface SubscriptionsByStatus {
  active: number;
  trialing: number;
  canceled: number;
  past_due: number;
}

interface MonthlyData {
  month: string;
  mrr: number;
  new: number;
  churned: number;
}

interface AnalyticsData {
  mrr: number;
  churn_rate: number;
  trial_conversion_rate: number;
  revenue_trend: MonthlyData[];
  new_vs_churned: Array<{ month: string; new: number; churned: number }>;
  subscriptions_by_status: SubscriptionsByStatus;
  total_subscriptions: number;
  avg_revenue_per_customer: number;
}

export default function SubscriptionAnalytics() {
  const { data: analytics, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['subscription-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('subscription-analytics');
      if (error) throw error;
      return data as AnalyticsData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value / 100);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  };

  const getChurnColor = (rate: number) => {
    if (rate < 5) return 'text-green-600';
    if (rate < 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getChurnBadgeVariant = (rate: number): "default" | "secondary" | "destructive" => {
    if (rate < 5) return 'default';
    if (rate < 10) return 'secondary';
    return 'destructive';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics de Assinaturas</h1>
          <p className="text-muted-foreground mt-1">
            Métricas de receita, conversão e retenção
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-semibold">Erro ao carregar analytics</p>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
        </div>
      </div>
    );
  }

  const statusData = Object.entries(analytics.subscriptions_by_status).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: COLORS[name as keyof typeof COLORS],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics de Assinaturas</h1>
        <p className="text-muted-foreground mt-1">
          Métricas de receita, conversão e retenção
        </p>
      </div>

      {/* Métricas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(analytics.mrr)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Receita Mensal Recorrente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getChurnColor(analytics.churn_rate)}`}>
              {analytics.churn_rate}%
            </div>
            <Badge variant={getChurnBadgeVariant(analytics.churn_rate)} className="mt-2">
              {analytics.churn_rate < 5 ? 'Excelente' : analytics.churn_rate < 10 ? 'Bom' : 'Atenção'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão Trial</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {analytics.trial_conversion_rate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Trial → Pago
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assinaturas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.total_subscriptions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Ativos: {analytics.subscriptions_by_status.active}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Tendência de Receita */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Evolução do MRR
          </CardTitle>
          <CardDescription>
            Receita mensal recorrente nos últimos 6 meses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.revenue_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tickFormatter={formatMonth}
              />
              <YAxis 
                tickFormatter={(value) => formatMoney(value)}
              />
              <Tooltip 
                formatter={(value: number) => formatMoney(value)}
                labelFormatter={(label: string) => formatMonth(label)}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="mrr"
                stroke="#10b981"
                strokeWidth={2}
                name="MRR"
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Novos vs Cancelamentos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Novos vs. Cancelamentos
            </CardTitle>
            <CardDescription>
              Comparativo mensal de entrada e saída
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.new_vs_churned}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatMonth} />
                <YAxis />
                <Tooltip labelFormatter={formatMonth} />
                <Legend />
                <Bar dataKey="new" fill="#3b82f6" name="Novos" />
                <Bar dataKey="churned" fill="#ef4444" name="Cancelados" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição por Status */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
            <CardDescription>
              Breakdown das assinaturas atuais
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {statusData.map((status) => (
                <div key={status.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: status.color }}
                    />
                    <span>{status.name}</span>
                  </div>
                  <span className="font-medium">{status.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Métricas Adicionais */}
      <Card>
        <CardHeader>
          <CardTitle>Métricas Adicionais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Receita Média por Cliente</p>
              <p className="text-2xl font-bold mt-1">
                {formatMoney(analytics.avg_revenue_per_customer)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assinaturas Ativas</p>
              <p className="text-2xl font-bold mt-1 text-green-600">
                {analytics.subscriptions_by_status.active}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Em Trial</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">
                {analytics.subscriptions_by_status.trialing}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
