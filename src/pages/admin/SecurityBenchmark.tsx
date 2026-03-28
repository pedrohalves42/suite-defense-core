import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, Award, Target, Users } from "lucide-react";

export default function SecurityBenchmark() {
  const { tenant } = useTenant();

  const { data: benchmarks = [] } = useQuery({
    queryKey: ["compliance-benchmarks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_benchmarks")
        .select("*")
        .order("period_month", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  // Get tenant's own score via RPC or fallback
  const { data: tenantScore } = useQuery({
    queryKey: ["tenant-compliance-score", tenant?.id],
    queryFn: async () => {
      // Try to get from compliance calculation edge function
      const { data, error } = await supabase.functions.invoke("calculate-compliance", {
        body: { tenant_id: tenant!.id },
      });
      if (error) return { overall_score: 0, grade: "N/A" };
      return data as { overall_score: number; grade: string };
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });

  const latestBenchmark = benchmarks[0];
  const myScore = tenantScore?.overall_score ?? 0;
  const avgScore = latestBenchmark?.avg_score ? Number(latestBenchmark.avg_score) : 0;
  const diff = myScore - avgScore;

  const trendData = benchmarks.slice(0, 6).reverse().map((b: Record<string, unknown>) => ({
    month: b.period_month,
    avg: Number(b.avg_score),
    median: Number(b.median_score),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" /> Security Score Benchmark
        </h1>
        <p className="text-muted-foreground">Compare sua postura de segurança com outras empresas</p>
      </div>

      {/* Main Score Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" /> Sua Empresa
          </CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className={`text-5xl font-bold ${myScore >= 70 ? "text-green-400" : myScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {myScore}
            </p>
            <p className="text-muted-foreground">/100</p>
            {tenantScore?.grade && (
              <Badge className="mt-2 text-lg px-4 py-1">{tenantScore.grade}</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Média do Mercado
          </CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className="text-5xl font-bold text-foreground">{avgScore.toFixed(0)}</p>
            <p className="text-muted-foreground">/100</p>
            {latestBenchmark && (
              <p className="text-xs text-muted-foreground mt-2">{latestBenchmark.tenant_count} empresas</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Sua Posição
          </CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className={`text-5xl font-bold ${diff >= 0 ? "text-green-400" : "text-red-400"}`}>
              {diff >= 0 ? "+" : ""}{diff.toFixed(0)}
            </p>
            <p className="text-muted-foreground">pontos vs média</p>
            <Badge variant={diff >= 0 ? "default" : "destructive"} className="mt-2">
              {diff >= 10 ? "Excelente" : diff >= 0 ? "Acima da Média" : diff >= -10 ? "Abaixo da Média" : "Atenção Urgente"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Score Bars */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Comparativo Visual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-foreground">Sua Empresa</span>
              <span className={myScore >= 70 ? "text-green-400" : "text-yellow-400"}>{myScore}/100</span>
            </div>
            <Progress value={myScore} className="h-4" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Média do Mercado</span>
              <span>{avgScore.toFixed(0)}/100</span>
            </div>
            <Progress value={avgScore} className="h-4 opacity-60" />
          </div>
          {latestBenchmark && (
            <>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Mediana</span>
                  <span>{Number(latestBenchmark.median_score).toFixed(0)}/100</span>
                </div>
                <Progress value={Number(latestBenchmark.median_score)} className="h-4 opacity-40" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Melhor Score</span>
                  <span className="text-green-400">{Number(latestBenchmark.max_score).toFixed(0)}/100</span>
                </div>
                <Progress value={Number(latestBenchmark.max_score)} className="h-4 opacity-30" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Evolução do Benchmark (últimos 6 meses)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" name="Média" strokeWidth={2} />
                <Line type="monotone" dataKey="median" stroke="hsl(var(--muted-foreground))" name="Mediana" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
