import { useQuery } from "@tanstack/react-query";
import { callGateway } from "@/lib/gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, Users, Target } from "lucide-react";

interface MonthlyProjection {
  month: number;
  mrr: number;
  arr: number;
  customers: number;
  newCustomers: number;
  churnedCustomers: number;
}

interface ScenarioSummary {
  name: string;
  growth_rate: number;
  churn_rate: number;
  conversion_rate: number;
  year_end_mrr: number;
  year_end_arr: number;
  year_end_customers: number;
}

interface RevenueProjectionsData {
  current: {
    mrr: number;
    arr: number;
    customers: number;
    avg_ticket: number;
  };
  projections: Record<string, MonthlyProjection[]>;
  month_labels: string[];
  scenarios: ScenarioSummary[];
}

export default function RevenueProjections() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["revenue-projections"],
    queryFn: async () => {
      return await callGateway<RevenueProjectionsData>('billing', 'revenue-projections');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Projeções de Receita</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-80 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Projeções de Receita</h1>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare chart data
  const chartData = data?.month_labels.map((label, index) => ({
    month: label,
    conservador: data.projections.conservative[index]?.mrr || 0,
    realista: data.projections.realistic[index]?.mrr || 0,
    otimista: data.projections.optimistic[index]?.mrr || 0,
  })) || [];

  const scenarioColors: Record<string, string> = {
    conservative: "#f59e0b",
    realistic: "#3b82f6",
    optimistic: "#10b981",
  };

  const scenarioNames: Record<string, string> = {
    conservative: "Conservador",
    realistic: "Realista",
    optimistic: "Otimista",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Projeções de Receita</h1>
        <p className="text-muted-foreground">
          Projeções de MRR e ARR para os próximos 12 meses
        </p>
      </div>

      {/* Current Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              MRR Atual
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              R$ {data?.current.mrr?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ARR Atual
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              R$ {data?.current.arr?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.current.customers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio
            </CardTitle>
            <Target className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {data?.current.avg_ticket?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projection Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projeção de MRR - 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis 
                  className="text-xs"
                  tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]}
                  labelFormatter={(label) => `Mês: ${label}`}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="conservador" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={false}
                  name="Conservador"
                />
                <Line 
                  type="monotone" 
                  dataKey="realista" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                  name="Realista"
                />
                <Line 
                  type="monotone" 
                  dataKey="otimista" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={false}
                  name="Otimista"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Scenario Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.scenarios.map((scenario) => (
          <Card key={scenario.name} className="border-l-4" style={{ borderLeftColor: scenarioColors[scenario.name] }}>
            <CardHeader>
              <CardTitle className="text-lg">{scenarioNames[scenario.name]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Crescimento Mensal</span>
                <span className="font-medium">{scenario.growth_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Churn Mensal</span>
                <span className="font-medium">{scenario.churn_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conversão Trial</span>
                <span className="font-medium">{scenario.conversion_rate}%</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">MRR (12 meses)</span>
                <span className="font-bold text-lg" style={{ color: scenarioColors[scenario.name] }}>
                  R$ {scenario.year_end_mrr?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ARR (12 meses)</span>
                <span className="font-medium">
                  R$ {scenario.year_end_arr?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clientes (12 meses)</span>
                <span className="font-medium">{scenario.year_end_customers}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
