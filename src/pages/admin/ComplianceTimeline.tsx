import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, FileText, Filter, Search, Clock, Shield, 
  AlertTriangle, CheckCircle, XCircle, Activity, RefreshCw,
  Calendar
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
// jsPDF and autoTable imported dynamically to avoid test/build issues

interface EvidenceLog {
  id: string;
  agent_id: string | null;
  agent_name: string;
  agent_version: string | null;
  event_type: string;
  event_data: any;
  evidence_hash: string;
  severity: string | null;
  state_before: string | null;
  state_after: string | null;
  created_at: string;
  tenant_id: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'hsl(var(--destructive))',
  high: 'hsl(var(--destructive) / 0.8)',
  medium: 'hsl(var(--warning))',
  low: 'hsl(var(--muted-foreground))',
  info: 'hsl(var(--primary))',
};

const EVENT_TYPE_ICONS: Record<string, React.ElementType> = {
  state_transition: Activity,
  policy_violation: AlertTriangle,
  security_event: Shield,
  compliance_check: CheckCircle,
  error: XCircle,
};

const ComplianceTimeline: React.FC = () => {
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7');

  // Fetch evidence logs
  const { data: evidenceLogs = [], isLoading, refetch } = useQuery({
    queryKey: ['evidence-logs', tenant?.id, dateRange],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const startDate = subDays(new Date(), parseInt(dateRange));
      
      const { data, error } = await supabase
        .from('agent_evidence_logs')
        .select('id, agent_id, agent_name, agent_version, event_type, event_data, evidence_hash, severity, state_before, state_after, created_at, tenant_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      return (data || []) as EvidenceLog[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  // Get unique agents for filter
  const uniqueAgents = useMemo(() => {
    const agents = new Set(evidenceLogs.map(log => log.agent_name));
    return Array.from(agents).sort();
  }, [evidenceLogs]);

  // Get unique event types for filter
  const uniqueEventTypes = useMemo(() => {
    const types = new Set(evidenceLogs.map(log => log.event_type));
    return Array.from(types).sort();
  }, [evidenceLogs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return evidenceLogs.filter(log => {
      const matchesSearch = 
        log.agent_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.evidence_hash.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesEventType = eventTypeFilter === 'all' || log.event_type === eventTypeFilter;
      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      const matchesAgent = agentFilter === 'all' || log.agent_name === agentFilter;
      
      return matchesSearch && matchesEventType && matchesSeverity && matchesAgent;
    });
  }, [evidenceLogs, searchTerm, eventTypeFilter, severityFilter, agentFilter]);

  // Chart data - events by day
  const eventsByDayData = useMemo(() => {
    const days = parseInt(dateRange, 10);
    const data: Record<string, { date: string; total: number; critical: number; high: number; medium: number; low: number; info: number }> = {};
    
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), i), 'dd/MM');
      data[date] = { date, total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    }
    
    filteredLogs.forEach(log => {
      const date = format(new Date(log.created_at), 'dd/MM');
      if (data[date]) {
        data[date].total++;
        const severity = log.severity || 'info';
        if (data[date][severity] !== undefined) {
          data[date][severity]++;
        }
      }
    });
    
    return Object.values(data).reverse();
  }, [filteredLogs, dateRange]);

  // Chart data - events by type
  const eventsByTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    filteredLogs.forEach(log => {
      types[log.event_type] = (types[log.event_type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [filteredLogs]);

  // Chart data - events by severity
  const eventsBySeverityData = useMemo(() => {
    const severities: Record<string, number> = {};
    filteredLogs.forEach(log => {
      const severity = log.severity || 'info';
      severities[severity] = (severities[severity] || 0) + 1;
    });
    return Object.entries(severities).map(([name, value]) => ({ 
      name, 
      value,
      color: SEVERITY_COLORS[name] || 'hsl(var(--muted))'
    }));
  }, [filteredLogs]);

  // Export to CSV
  const exportCSV = () => {
    const headers = ['Data/Hora', 'Agente', 'Tipo', 'Severidade', 'Estado Anterior', 'Estado Posterior', 'Hash'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
      log.agent_name,
      log.event_type,
      log.severity || 'info',
      log.state_before || '-',
      log.state_after || '-',
      log.evidence_hash.substring(0, 16) + '...'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compliance-timeline-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso');
  };

  // Export to PDF
  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      
      // Header with logo
      const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
      const logoDataUrl = await loadLogoForPDF();
      addLogoToPDF(doc, logoDataUrl, 22, 6, 16);
      doc.setFontSize(16);
      doc.setTextColor(0, 100, 180);
      doc.text('Relatório de Compliance - Timeline de Evidências', 36, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 28);
      doc.text(`Período: Últimos ${dateRange} dias`, 14, 34);
      doc.text(`Total de eventos: ${filteredLogs.length}`, 14, 40);
      
      // Statistics
      const criticalCount = filteredLogs.filter(l => l.severity === 'critical').length;
      const highCount = filteredLogs.filter(l => l.severity === 'high').length;
      
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Resumo de Severidade:', 14, 52);
      
      doc.setFontSize(10);
      doc.setTextColor(200, 0, 0);
      doc.text(`• Crítico: ${criticalCount}`, 20, 60);
      doc.setTextColor(255, 100, 0);
      doc.text(`• Alto: ${highCount}`, 20, 66);
      doc.setTextColor(0);
      
      // Table
      const tableData = filteredLogs.slice(0, 100).map(log => [
        format(new Date(log.created_at), 'dd/MM HH:mm'),
        log.agent_name.substring(0, 15),
        log.event_type.substring(0, 20),
        log.severity || 'info',
        log.state_before?.substring(0, 10) || '-',
        log.state_after?.substring(0, 10) || '-'
      ]);
      
      autoTable(doc, {
        head: [['Data', 'Agente', 'Tipo', 'Severidade', 'De', 'Para']],
        body: tableData,
        startY: 75,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 100, 180] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      
      // Footer with hash
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 180, 290);
      }
      
      doc.save(`compliance-timeline-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF exportado com sucesso');
    } catch (error) {
      logger.error('Failed to load PDF library:', error);
      toast.error('Erro ao carregar biblioteca de PDF');
    }
  };

  const getSeverityBadge = (severity: string | null) => {
    const sev = severity || 'info';
    const variants: Record<string, 'destructive' | 'secondary' | 'outline' | 'default'> = {
      critical: 'destructive',
      high: 'destructive',
      medium: 'secondary',
      low: 'outline',
      info: 'default',
    };
    return <Badge variant={variants[sev] || 'default'}>{sev}</Badge>;
  };

  const getEventIcon = (eventType: string) => {
    const Icon = EVENT_TYPE_ICONS[eventType] || Activity;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Timeline de Compliance
            </h2>
            <p className="text-sm text-muted-foreground">
              Registro de evidências e eventos de segurança para auditoria
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <FileText className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="default" size="sm" onClick={exportPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredLogs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Eventos Críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {filteredLogs.filter(l => l.severity === 'critical').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Agentes Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueAgents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tipos de Evento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueEventTypes.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último dia</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {uniqueEventTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os agentes</SelectItem>
                {uniqueAgents.map(agent => (
                  <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="distribution">Distribuição</TabsTrigger>
          <TabsTrigger value="table">Tabela</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Eventos por Dia</CardTitle>
              <CardDescription>Distribuição temporal de eventos de compliance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={eventsByDayData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))' 
                      }} 
                    />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" name="Total" strokeWidth={2} />
                    <Line type="monotone" dataKey="critical" stroke="hsl(var(--destructive))" name="Crítico" />
                    <Line type="monotone" dataKey="high" stroke="hsl(var(--destructive) / 0.7)" name="Alto" />
                    <Line type="monotone" dataKey="medium" stroke="hsl(var(--warning))" name="Médio" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Por Tipo de Evento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={eventsByTypeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" name="Eventos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Por Severidade</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={eventsBySeverityData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {eventsBySeverityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Registro de Evidências</CardTitle>
              <CardDescription>
                Mostrando {filteredLogs.length} eventos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-4" />
                  <p>Nenhum evento encontrado</p>
                  <p className="text-sm">Ajuste os filtros ou aguarde novos eventos</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">Data/Hora</TableHead>
                        <TableHead>Agente</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Severidade</TableHead>
                        <TableHead>Transição</TableHead>
                        <TableHead className="text-right">Hash</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.slice(0, 100).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(log.created_at), 'dd/MM HH:mm:ss')}
                          </TableCell>
                          <TableCell className="font-medium">{log.agent_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getEventIcon(log.event_type)}
                              <span className="text-sm">{log.event_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                          <TableCell className="text-sm">
                            {log.state_before && log.state_after ? (
                              <span>
                                {log.state_before} → {log.state_after}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {log.evidence_hash.substring(0, 12)}...
                            </code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ComplianceTimeline;
