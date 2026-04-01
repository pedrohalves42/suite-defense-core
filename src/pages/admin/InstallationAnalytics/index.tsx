import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Download, CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useInstallationAnalytics } from './useInstallationAnalytics';

export default function InstallationAnalytics() {
  const {
    isLoading, metrics, conversionRate, avgInstallTime,
    platformData, eventData, timelineData, COLORS, installEvents,
  } = useInstallationAnalytics();

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
      <div>
        <h1 className="text-3xl font-bold">Analytics de Instalacao</h1>
        <p className="text-muted-foreground">Acompanhe metricas de instaladores gerados, baixados e instalados</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gerados</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total_generated}</div>
            <p className="text-xs text-muted-foreground">Instaladores criados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Baixados</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total_downloaded}</div>
            <p className="text-xs text-muted-foreground">Scripts baixados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instalados</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{metrics.total_installed}</div>
            <p className="text-xs text-muted-foreground">Com sucesso</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversao</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">Gerados → Instalados</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="funnel" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="funnel">Funil</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="platforms">Plataformas</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="funnel">
          <Card>
            <CardHeader>
              <CardTitle>Funil de Conversao de Instalacao</CardTitle>
              <CardDescription>Acompanhe cada etapa do processo de instalacao</CardDescription>
            </CardHeader>
            <CardContent>
              <FunnelSteps metrics={metrics} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Ultimos 7 Dias</CardTitle>
              <CardDescription>Atividade de instalacao ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="generated" stroke="#3b82f6" name="Gerados" />
                  <Line type="monotone" dataKey="installed" stroke="#10b981" name="Instalados" />
                  <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Falhados" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platforms">
          <Card>
            <CardHeader>
              <CardTitle>Distribuicao por Plataforma</CardTitle>
              <CardDescription>Windows vs Linux</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80} fill="#8884d8" dataKey="value">
                    {platformData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Eventos</CardTitle>
              <CardDescription>Distribuicao de eventos de instalacao</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={eventData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#3b82f6">
                    {eventData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />Tempo Medio de Instalacao
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgInstallTime ? `${Math.round(avgInstallTime)}s` : 'N/A'}</div>
            <p className="text-sm text-muted-foreground mt-2">Baseado em {installEvents.length} instalacoes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />Taxa de Falha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {metrics.total_generated > 0 ? `${((metrics.total_failed / metrics.total_generated) * 100).toFixed(1)}%` : '0%'}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{metrics.total_failed} instalacoes falharam</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FunnelSteps({ metrics }: { metrics: { total_generated: number; total_copied: number; total_downloaded: number; total_installed: number; total_failed: number } }) {
  const pct = (v: number) => metrics.total_generated > 0 ? ((v / metrics.total_generated) * 100).toFixed(1) : '0';
  const steps = [
    { icon: Activity, label: '1. Instalador Gerado', value: metrics.total_generated, color: 'bg-blue-600', pct: '100' },
    { icon: Download, label: '2. Comando Copiado', value: metrics.total_copied, color: 'bg-amber-600', pct: pct(metrics.total_copied) },
    { icon: Download, label: '3. Script Baixado', value: metrics.total_downloaded, color: 'bg-purple-600', pct: pct(metrics.total_downloaded) },
    { icon: CheckCircle, label: '4. Instalacao Completa', value: metrics.total_installed, color: 'bg-green-600', pct: pct(metrics.total_installed) },
  ];

  return (
    <div className="space-y-4">
      {steps.map((step) => (
        <div key={step.label} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <step.icon className="h-5 w-5" />
              <span className="font-semibold">{step.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{step.value}</span>
              <span className="text-sm text-muted-foreground">({step.pct}%)</span>
            </div>
          </div>
          <div className="w-full bg-secondary rounded-full h-8">
            <div className={`${step.color} h-8 rounded-full flex items-center justify-center text-white text-sm font-medium transition-all`}
              style={{ width: `${step.pct}%` }}>{step.pct}%</div>
          </div>
        </div>
      ))}
      <div className="mt-6 p-4 bg-muted rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-sm text-muted-foreground">Taxa de Copia</p><p className="text-xl font-bold">{pct(metrics.total_copied)}%</p></div>
          <div><p className="text-sm text-muted-foreground">Taxa de Download</p><p className="text-xl font-bold">{pct(metrics.total_downloaded)}%</p></div>
          <div><p className="text-sm text-muted-foreground">Taxa de Instalacao</p><p className="text-xl font-bold">{pct(metrics.total_installed)}%</p></div>
          <div><p className="text-sm text-muted-foreground">Taxa de Falha</p><p className="text-xl font-bold text-destructive">{pct(metrics.total_failed)}%</p></div>
        </div>
      </div>
    </div>
  );
}
