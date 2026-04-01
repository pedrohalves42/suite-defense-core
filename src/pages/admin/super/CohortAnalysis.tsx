import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, TrendingUp, Percent } from "lucide-react";

interface CohortData {
  month: string;
  total: number;
  active: number;
  churned: number;
  retention_rate: number;
  months_since_creation: number[];
}

interface CohortAnalysisData {
  cohorts: CohortData[];
  summary: {
    total_tenants: number;
    active_tenants: number;
    avg_retention_rate: number;
    cohort_count: number;
  };
}

export default function CohortAnalysis() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cohort-analysis"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("api-gateway", {
        body: { action: "billing:cohort-analysis", payload: {} },
      });

      if (response.error) throw response.error;
      return response.data as CohortAnalysisData;
    },
  });

  const getRetentionColor = (rate: number) => {
    if (rate >= 80) return "bg-emerald-500/20 text-emerald-700";
    if (rate >= 60) return "bg-yellow-500/20 text-yellow-700";
    if (rate >= 40) return "bg-orange-500/20 text-orange-700";
    return "bg-red-500/20 text-red-700";
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Análise de Cohort</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
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
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Análise de Cohort</h1>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Análise de Cohort</h1>
        <p className="text-muted-foreground">
          Retenção de clientes agrupados por mês de aquisição
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Tenants
            </CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.total_tenants || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tenants Ativos
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {data?.summary.active_tenants || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Retenção Média
            </CardTitle>
            <Percent className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {data?.summary.avg_retention_rate?.toFixed(1) || 0}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cohorts Analisados
            </CardTitle>
            <Users className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.cohort_count || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Cohort Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tabela de Retenção por Cohort</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.cohorts && data.cohorts.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cohort</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Ativos</TableHead>
                    <TableHead className="text-center">Cancelados</TableHead>
                    <TableHead className="text-center">Retenção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cohorts.map((cohort) => (
                    <TableRow key={cohort.month}>
                      <TableCell className="font-medium">
                        {formatMonth(cohort.month)}
                      </TableCell>
                      <TableCell className="text-center">{cohort.total}</TableCell>
                      <TableCell className="text-center text-emerald-600 font-medium">
                        {cohort.active}
                      </TableCell>
                      <TableCell className="text-center text-red-600">
                        {cohort.churned}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${getRetentionColor(cohort.retention_rate)}`}>
                          {cohort.retention_rate.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum dado de cohort disponível</p>
              <p className="text-sm">Os dados aparecerão conforme novos clientes se cadastrarem</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500/20"></div>
              <span className="text-sm">≥80% Excelente</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500/20"></div>
              <span className="text-sm">60-79% Bom</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-500/20"></div>
              <span className="text-sm">40-59% Atenção</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500/20"></div>
              <span className="text-sm">&lt;40% Crítico</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
