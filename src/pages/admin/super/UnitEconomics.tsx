import { useQuery } from "@tanstack/react-query";
import { callGateway } from "@/lib/gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Users, Clock, Target, Percent } from "lucide-react";
import { HelpTooltip } from "@/components/ui/tech-tooltip";

interface UnitEconomicsData {
  mrr: number;
  arr: number;
  arpa: number;
  cac: number;
  ltv: number;
  ltv_cac_ratio: number;
  payback_months: number;
  churn_rate: number;
  gross_margin: number;
  active_customers: number;
  total_marketing_spend: number;
  total_conversions: number;
}

export default function UnitEconomics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["unit-economics"],
    queryFn: async () => {
      return await callGateway<UnitEconomicsData>('billing', 'unit-economics');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Unit Economics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Unit Economics</h1>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = [
    {
      title: "MRR",
      tooltip: "mrr",
      value: `R$ ${data?.mrr?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      subtitle: "Receita Mensal Recorrente",
      icon: DollarSign,
      color: "text-emerald-500",
    },
    {
      title: "ARR",
      tooltip: "arr",
      value: `R$ ${data?.arr?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      subtitle: "Receita Anual Recorrente",
      icon: TrendingUp,
      color: "text-blue-500",
    },
    {
      title: "ARPA",
      tooltip: "arpa",
      value: `R$ ${data?.arpa?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      subtitle: "Receita Média por Cliente",
      icon: Users,
      color: "text-purple-500",
    },
    {
      title: "CAC",
      tooltip: "cac",
      value: `R$ ${data?.cac?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      subtitle: "Custo de Aquisição de Cliente",
      icon: Target,
      color: "text-orange-500",
    },
    {
      title: "LTV",
      tooltip: "ltv",
      value: `R$ ${data?.ltv?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      subtitle: "Valor do Cliente ao Longo do Tempo",
      icon: TrendingUp,
      color: "text-cyan-500",
    },
    {
      title: "LTV / CAC",
      tooltip: "ltv/cac",
      value: data?.ltv_cac_ratio?.toFixed(2) || "0.00",
      subtitle: data?.ltv_cac_ratio && data.ltv_cac_ratio >= 3 ? "✅ Saudável (≥3x)" : "⚠️ Meta: ≥3x",
      icon: Percent,
      color: data?.ltv_cac_ratio && data.ltv_cac_ratio >= 3 ? "text-emerald-500" : "text-amber-500",
    },
    {
      title: "Payback",
      tooltip: "payback",
      value: `${data?.payback_months?.toFixed(1) || "0"} meses`,
      subtitle: "Meses para Recuperar Investimento",
      icon: Clock,
      color: "text-indigo-500",
    },
    {
      title: "Churn",
      tooltip: "churn",
      value: `${data?.churn_rate?.toFixed(1) || "0"}%`,
      subtitle: "Taxa de Cancelamento Mensal",
      icon: Percent,
      color: data?.churn_rate && data.churn_rate <= 5 ? "text-emerald-500" : "text-red-500",
    },
    {
      title: "Clientes Ativos",
      value: data?.active_customers?.toString() || "0",
      subtitle: "Assinaturas Ativas",
      icon: Users,
      color: "text-blue-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Indicadores Financeiros</h1>
        <p className="text-muted-foreground">
          Métricas essenciais do negócio SaaS
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                {metric.title}
                {metric.tooltip && <HelpTooltip term={metric.tooltip} />}
              </CardTitle>
              <metric.icon className={`h-4 w-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${metric.color}`}>
                {metric.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metric.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Marketing Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo de Marketing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Investimento Total</p>
              <p className="text-xl font-bold">
                R$ {data?.total_marketing_spend?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conversões</p>
              <p className="text-xl font-bold">{data?.total_conversions || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Margem Bruta</p>
              <p className="text-xl font-bold">{data?.gross_margin || 85}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-xl font-bold">
                {data?.ltv_cac_ratio && data.ltv_cac_ratio >= 3 
                  ? "🟢 Saudável" 
                  : "🟡 Atenção"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
