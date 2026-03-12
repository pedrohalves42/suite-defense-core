import { useMemo } from "react";
import { Activity, Shield, LineChart, PieChart, BarChart3, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart as RechartsLineChart, Bar, BarChart as RechartsBarChart, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip } from "recharts";
import { getJobTypeLabelNoEmoji } from "@/lib/job-labels";
import { formatBrazilDateTime } from "@/lib/date-utils";
import type { DashboardJob, DashboardVirusScan } from "@/hooks/useDashboardData";

const COLORS = [
  'hsl(217 91% 60%)', 'hsl(142 71% 45%)', 'hsl(38 92% 50%)', 'hsl(262 83% 58%)',
  'hsl(0 84% 60%)', 'hsl(189 94% 43%)', 'hsl(330 81% 60%)', 'hsl(24 95% 53%)',
];
const MAX_PIE_CATEGORIES = 8;

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date.toISOString().split('T')[0]);
  }
  return days;
}

interface DashboardChartsProps {
  jobs: DashboardJob[];
  virusScans: DashboardVirusScan[];
  loading: boolean;
}

export function DashboardCharts({ jobs, virusScans, loading }: DashboardChartsProps) {
  const last7Days = getLast7Days();

  const jobsTrendData = last7Days.map(day => {
    const dayJobs = jobs.filter(j => j.created_at.startsWith(day));
    return {
      date: formatBrazilDateTime(day, 'day-month'),
      total: dayJobs.length,
      completed: dayJobs.filter(j => j.status === 'completed').length,
      failed: dayJobs.filter(j => j.status === 'failed').length,
    };
  });

  const scansTrendData = last7Days.map(day => {
    const dayScans = virusScans.filter(s => s.scanned_at.startsWith(day));
    return {
      date: formatBrazilDateTime(day, 'day-month'),
      total: dayScans.length,
      malicious: dayScans.filter(s => s.is_malicious).length,
      clean: dayScans.filter(s => s.is_malicious === false).length,
    };
  });

  const jobTypeDataRaw = Object.entries(
    jobs.reduce((acc, job) => {
      acc[job.type] = (acc[job.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, count]) => ({ name: getJobTypeLabelNoEmoji(type), originalType: type, value: count }))
   .sort((a, b) => b.value - a.value);

  const jobTypeData = useMemo(() => {
    if (jobTypeDataRaw.length <= MAX_PIE_CATEGORIES) return jobTypeDataRaw;
    const top = jobTypeDataRaw.slice(0, MAX_PIE_CATEGORIES - 1);
    const othersValue = jobTypeDataRaw.slice(MAX_PIE_CATEGORIES - 1).reduce((sum, d) => sum + d.value, 0);
    return [...top, { name: `Outros (${jobTypeDataRaw.length - MAX_PIE_CATEGORIES + 1} tipos)`, originalType: 'others', value: othersValue }];
  }, [jobTypeDataRaw]);

  const jobsByAgentData = Object.entries(
    jobs.reduce((acc, job) => {
      acc[job.agent_name] = (acc[job.agent_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([agent, count]) => ({ agent, jobs: count }));

  const tooltipStyle = { backgroundColor: 'hsl(222 47% 11%)', border: '1px solid hsl(215 20% 25%)', borderRadius: '6px' };

  const EmptyChart = ({ icon: Icon, text }: { icon: typeof Activity; text: string }) => (
    <div className="text-center py-8">
      <Icon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="text-muted-foreground">{text}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Jobs Trend */}
      <Card className="bg-gradient-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />Tendência de Verificações (7 dias)
          </CardTitle>
          <CardDescription>
            Volume de verificações por dia
            <span className="block text-[10px] text-muted-foreground/70 mt-1">📊 Subindo = demanda aumentando • Estável = sistema saudável</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <ChartItemSkeleton /> :
           jobsTrendData.every(d => d.total === 0) ? <EmptyChart icon={Activity} text="Nenhuma verificação nos últimos 7 dias" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <RechartsLineChart data={jobsTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 25%)" />
                <XAxis dataKey="date" stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                <YAxis stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="total" stroke="hsl(195 100% 50%)" strokeWidth={2} name="Total" dot={{ fill: 'hsl(195 100% 50%)' }} />
                <Line type="monotone" dataKey="completed" stroke="hsl(142 76% 45%)" strokeWidth={2} name="Concluídas" dot={{ fill: 'hsl(142 76% 45%)' }} />
                <Line type="monotone" dataKey="failed" stroke="hsl(0 70% 55%)" strokeWidth={2} name="Com Erro" dot={{ fill: 'hsl(0 70% 55%)' }} />
              </RechartsLineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Virus Scans */}
      <Card className="bg-gradient-card border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />Verificações de Vírus (7 dias)
          </CardTitle>
          <CardDescription>
            Arquivos verificados por dia
            <span className="block text-[10px] text-muted-foreground/70 mt-1">🛡️ Vermelho = ameaças detectadas • Verde = arquivos limpos</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <ChartItemSkeleton /> :
           scansTrendData.every(d => d.total === 0) ? <EmptyChart icon={Shield} text="Nenhuma verificação nos últimos 7 dias" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <RechartsLineChart data={scansTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 25%)" />
                <XAxis dataKey="date" stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                <YAxis stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="total" stroke="hsl(160 100% 45%)" strokeWidth={2} name="Total" dot={{ fill: 'hsl(160 100% 45%)' }} />
                <Line type="monotone" dataKey="malicious" stroke="hsl(0 70% 55%)" strokeWidth={2} name="Maliciosos" dot={{ fill: 'hsl(0 70% 55%)' }} />
                <Line type="monotone" dataKey="clean" stroke="hsl(142 76% 45%)" strokeWidth={2} name="Limpos" dot={{ fill: 'hsl(142 76% 45%)' }} />
              </RechartsLineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Job Types */}
      <Card className="bg-gradient-card border-warning/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-warning" />Tipos de Tarefas
          </CardTitle>
          <CardDescription>
            Distribuição por categoria
            {jobTypeDataRaw.length > MAX_PIE_CATEGORIES && (
              <span className="block text-[10px] text-muted-foreground/70 mt-1">Top {MAX_PIE_CATEGORIES - 1} categorias · {jobTypeDataRaw.length} tipos no total</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <ChartItemSkeleton /> :
           jobTypeData.length === 0 ? <EmptyChart icon={PieChart} text="Sem dados para exibir" /> : (() => {
            const maxVal = Math.max(...jobTypeData.map(d => d.value));
            return (
              <div className="space-y-2.5">
                {jobTypeData.map((entry, index) => {
                  const pct = maxVal > 0 ? (entry.value / maxVal) * 100 : 0;
                  const color = COLORS[index % COLORS.length];
                  return (
                    <div key={entry.name} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground truncate max-w-[65%]" title={entry.name}>{entry.name}</span>
                        <span className="text-xs font-semibold text-foreground tabular-nums">{entry.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Jobs by Agent */}
      <Card className="bg-gradient-card border-success/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-success" />Tarefas por Computador (Top 10)
          </CardTitle>
          <CardDescription>
            Computadores mais ativos
            <span className="block text-[10px] text-muted-foreground/70 mt-1">Concentração alta pode indicar problemas recorrentes</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <ChartItemSkeleton /> :
           jobsByAgentData.length === 0 ? <EmptyChart icon={BarChart3} text="Sem dados para exibir" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <RechartsBarChart data={jobsByAgentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 25%)" />
                <XAxis type="number" stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                <YAxis dataKey="agent" type="category" width={100} stroke="hsl(180 20% 60%)" style={{ fontSize: '10px' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="jobs" fill="hsl(142 76% 45%)" radius={[0, 4, 4, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
