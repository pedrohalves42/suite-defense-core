import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon, BarChart3, Wifi, Monitor } from 'lucide-react';
import type { ScansTrendPoint, JobsTrendPoint, UptimeDataPoint } from './types';

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
};

interface TrendChartsProps {
  scansTrendData: ScansTrendPoint[];
  jobsTrendData: JobsTrendPoint[];
  uptimeChartData: UptimeDataPoint[];
}

export function TrendCharts({ scansTrendData, jobsTrendData, uptimeChartData }: TrendChartsProps) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Scans Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-primary" />
              Verificações de Segurança (7 dias)
            </CardTitle>
            <CardDescription>
              Volume de scans de vírus realizados
              <span className="block text-xs mt-1 text-muted-foreground/70">
                📊 Linha subindo = mais verificações • Estável = operação normal
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scansTrendData.every(d => d.total === 0) ? (
              <div className="text-center py-8">
                <LineChartIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhuma verificação nos últimos 7 dias</p>
                <p className="text-xs text-muted-foreground/70 mt-1">As verificações automáticas acontecem periodicamente</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={scansTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" name="Total" strokeWidth={2} />
                  <Line type="monotone" dataKey="malicious" stroke="hsl(var(--destructive))" name="Maliciosos" strokeWidth={2} />
                  <Line type="monotone" dataKey="clean" stroke="hsl(var(--success))" name="Limpos" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Jobs Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Execução de Tarefas (7 dias)
            </CardTitle>
            <CardDescription>
              Performance das tarefas ao longo do tempo
              <span className="block text-xs mt-1 text-muted-foreground/70">
                📊 Verde = sucesso • Amarelo = pendente • Vermelho = falha
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobsTrendData.every(d => d.total === 0) ? (
              <div className="text-center py-8">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhuma tarefa executada nos últimos 7 dias</p>
                <p className="text-xs text-green-500 mt-1">✓ Isso pode indicar estabilidade operacional</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={jobsTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="completed" fill="hsl(var(--success))" name="Concluídos" />
                  <Bar dataKey="pending" fill="hsl(var(--warning))" name="Pendentes" />
                  <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Falhados" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Uptime */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            Tempo Online dos Computadores
          </CardTitle>
          <CardDescription>
            Status de conectividade atual de cada computador
            <span className="block text-xs mt-1 text-muted-foreground/70">
              📊 Barra cheia (100%) = online agora • Barra vazia = offline
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uptimeChartData.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhum computador cadastrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Cadastre computadores para ver o status aqui</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, uptimeChartData.length * 40)}>
              <BarChart data={uptimeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} width={100} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [`${value}%`, 'Uptime']} />
                <Bar dataKey="uptime" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </>
  );
}
