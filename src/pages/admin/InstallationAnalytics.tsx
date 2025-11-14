import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Download, CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export default function InstallationAnalytics() {
  const { toast } = useToast();

  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['installation-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_analytics')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          title: "Erro ao carregar analytics",
          description: error.message,
          variant: "destructive"
        });
        throw error;
      }

      return data;
    }
  });

  // Calculate metrics
  const metrics = {
    total_generated: analytics?.filter(a => a.event_type === 'generated').length || 0,
    total_downloaded: analytics?.filter(a => a.event_type === 'downloaded').length || 0,
    total_copied: analytics?.filter(a => a.event_type === 'command_copied').length || 0,
    total_installed: analytics?.filter(a => 
      a.event_type === 'post_installation' || 
      a.event_type === 'post_installation_unverified'
    ).length || 0,
    total_failed: analytics?.filter(a => a.event_type === 'failed').length || 0,
  };

  const conversionRate = metrics.total_generated > 0
    ? ((metrics.total_installed / metrics.total_generated) * 100).toFixed(1)
    : '0';

  const avgInstallTime = analytics
    ?.filter(a => (a.event_type === 'post_installation' || a.event_type === 'post_installation_unverified') && a.installation_time_seconds)
    .reduce((acc, curr) => acc + (curr.installation_time_seconds || 0), 0) / 
    (analytics?.filter(a => (a.event_type === 'post_installation' || a.event_type === 'post_installation_unverified') && a.installation_time_seconds).length || 1);

  // Platform distribution
  const platformData = [
    {
      name: 'Windows',
      value: analytics?.filter(a => a.platform === 'windows').length || 0
    },
    {
      name: 'Linux',
      value: analytics?.filter(a => a.platform === 'linux').length || 0
    }
  ];

  // Event type distribution
  const eventData = [
    { name: 'Gerados', value: metrics.total_generated, color: COLORS[1] },
    { name: 'Baixados', value: metrics.total_downloaded, color: COLORS[2] },
    { name: 'Instalados', value: metrics.total_installed, color: COLORS[0] },
    { name: 'Falhados', value: metrics.total_failed, color: COLORS[3] }
  ];

  // Timeline data (last 7 days)
  const timelineData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split('T')[0];
    
    return {
      date: dateStr,
      generated: analytics?.filter(a => 
        a.created_at.startsWith(dateStr) && a.event_type === 'generated'
      ).length || 0,
      installed: analytics?.filter(a => 
        a.created_at.startsWith(dateStr) && (a.event_type === 'post_installation' || a.event_type === 'post_installation_unverified')
      ).length || 0,
      failed: analytics?.filter(a => 
        a.created_at.startsWith(dateStr) && a.event_type === 'failed'
      ).length || 0,
    };
  });

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
        <h1 className="text-3xl font-bold">Analytics de Instalação</h1>
        <p className="text-muted-foreground">
          Acompanhe métricas de instaladores gerados, baixados e instalados
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gerados</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total_generated}</div>
            <p className="text-xs text-muted-foreground">
              Instaladores criados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Baixados</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total_downloaded}</div>
            <p className="text-xs text-muted-foreground">
              Scripts baixados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instalados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.total_installed}</div>
            <p className="text-xs text-muted-foreground">
              Com sucesso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Gerados → Instalados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="platforms">Plataformas</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Últimos 7 Dias</CardTitle>
              <CardDescription>Atividade de instalação ao longo do tempo</CardDescription>
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

        <TabsContent value="platforms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Plataforma</CardTitle>
              <CardDescription>Windows vs Linux</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={platformData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {platformData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Eventos</CardTitle>
              <CardDescription>Distribuição de eventos de instalação</CardDescription>
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

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Tempo Médio de Instalação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {avgInstallTime ? `${Math.round(avgInstallTime)}s` : 'N/A'}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Baseado em {analytics?.filter(a => a.event_type === 'installed').length || 0} instalações
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Taxa de Falha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {metrics.total_generated > 0
                ? `${((metrics.total_failed / metrics.total_generated) * 100).toFixed(1)}%`
                : '0%'}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {metrics.total_failed} instalações falharam
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}