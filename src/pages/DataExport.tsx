import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

type ExportType = 'agents' | 'scans' | 'jobs' | 'quarantine' | 'audit_logs';
type DateRange = '7' | '30' | '90' | 'all';
type ExportFormat = 'csv' | 'excel';

export default function DataExport() {
  const { tenant } = useTenant();
  const [exportType, setExportType] = useState<ExportType>('agents');
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);

  // Statistics
  const { data: stats } = useQuery({
    queryKey: ['export-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const [agents, scans, jobs, quarantine, auditLogs] = await Promise.all([
        supabase.from('agents').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('virus_scans').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('quarantined_files').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      ]);

      return {
        agents: agents.count || 0,
        scans: scans.count || 0,
        jobs: jobs.count || 0,
        quarantine: quarantine.count || 0,
        auditLogs: auditLogs.count || 0,
      };
    },
    enabled: !!tenant?.id,
  });

  const exportData = async () => {
    if (!tenant?.id) {
      toast.error('Tenant não identificado');
      return;
    }

    setIsExporting(true);

    try {
      let data: any[] = [];
      let filename = '';
      let columns: string[] = [];

      // Calculate date filter
      const dateFilter = dateRange === 'all' 
        ? null 
        : subDays(new Date(), parseInt(dateRange)).toISOString();

      // Fetch data based on type
      switch (exportType) {
        case 'agents': {
          const query = supabase
            .from('agents')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('enrolled_at', { ascending: false });

          if (dateFilter) query.gte('enrolled_at', dateFilter);

          const { data: agents, error } = await query;
          if (error) throw error;

          data = agents.map(a => ({
            'Nome do Agente': a.agent_name,
            'Status': a.status,
            'Data de Registro': format(new Date(a.enrolled_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
            'Último Heartbeat': a.last_heartbeat 
              ? format(new Date(a.last_heartbeat), 'dd/MM/yyyy HH:mm', { locale: ptBR })
              : 'Nunca',
            'Tenant ID': a.tenant_id,
          }));

          filename = `agentes_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;
          break;
        }

        case 'scans': {
          const query = supabase
            .from('virus_scans')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('scanned_at', { ascending: false });

          if (dateFilter) query.gte('scanned_at', dateFilter);

          const { data: scans, error } = await query;
          if (error) throw error;

          data = scans.map(s => ({
            'Agente': s.agent_name,
            'Arquivo': s.file_path,
            'Hash': s.file_hash,
            'Resultado': s.is_malicious ? 'Malicioso' : 'Limpo',
            'Detecções': `${s.positives}/${s.total_scans}`,
            'Data do Scan': format(new Date(s.scanned_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
            'Link VirusTotal': s.virustotal_permalink || '',
          }));

          filename = `scans_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;
          break;
        }

        case 'jobs': {
          const query = supabase
            .from('jobs')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

          if (dateFilter) query.gte('created_at', dateFilter);

          const { data: jobs, error } = await query;
          if (error) throw error;

          data = jobs.map(j => ({
            'Agente': j.agent_name,
            'Tipo': j.type,
            'Status': j.status,
            'Criado em': format(new Date(j.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
            'Entregue em': j.delivered_at 
              ? format(new Date(j.delivered_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
              : '-',
            'Concluído em': j.completed_at 
              ? format(new Date(j.completed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
              : '-',
            'Aprovado': j.approved ? 'Sim' : 'Não',
            'Agendado para': j.scheduled_at 
              ? format(new Date(j.scheduled_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
              : '-',
            'Recorrente': j.is_recurring ? 'Sim' : 'Não',
          }));

          filename = `jobs_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;
          break;
        }

        case 'quarantine': {
          const query = supabase
            .from('quarantined_files')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('quarantined_at', { ascending: false });

          if (dateFilter) query.gte('quarantined_at', dateFilter);

          const { data: quarantine, error } = await query;
          if (error) throw error;

          data = quarantine.map(q => ({
            'Agente': q.agent_name,
            'Arquivo': q.file_path,
            'Hash': q.file_hash,
            'Motivo': q.quarantine_reason,
            'Status': q.status,
            'Quarentinado em': format(new Date(q.quarantined_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
            'Restaurado em': q.restored_at 
              ? format(new Date(q.restored_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
              : '-',
          }));

          filename = `quarentena_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;
          break;
        }

        case 'audit_logs': {
          const query = supabase
            .from('audit_logs')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

          if (dateFilter) query.gte('created_at', dateFilter);

          const { data: logs, error } = await query;
          if (error) throw error;

          data = logs.map(l => ({
            'Ação': l.action,
            'Tipo de Recurso': l.resource_type,
            'ID do Recurso': l.resource_id || '-',
            'Sucesso': l.success ? 'Sim' : 'Não',
            'Data': format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }),
            'IP': l.ip_address || '-',
            'User Agent': l.user_agent || '-',
          }));

          filename = `logs_auditoria_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;
          break;
        }
      }

      if (data.length === 0) {
        toast.error('Nenhum dado disponível para exportar');
        return;
      }

      // Export based on format
      if (exportFormat === 'csv') {
        exportToCSV(data, filename);
      } else {
        exportToExcel(data, filename);
      }

      toast.success(`${data.length} registros exportados com sucesso!`);
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Erro ao exportar dados');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    // Get headers from first object
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma or newline
          const stringValue = String(value || '');
          if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ].join('\n');

    // Add BOM for Excel UTF-8 support
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };

  const exportToExcel = (data: any[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.min(
        maxWidth,
        Math.max(
          key.length,
          ...data.map(row => String(row[key] || '').length)
        )
      )
    }));
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  const exportOptions = [
    { value: 'agents', label: 'Agentes', count: stats?.agents || 0, icon: CheckCircle },
    { value: 'scans', label: 'Scans de Vírus', count: stats?.scans || 0, icon: FileText },
    { value: 'jobs', label: 'Jobs', count: stats?.jobs || 0, icon: Calendar },
    { value: 'quarantine', label: 'Quarentena', count: stats?.quarantine || 0, icon: Download },
    { value: 'audit_logs', label: 'Logs de Auditoria', count: stats?.auditLogs || 0, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-bold">Exportação de Dados</h2>
          <p className="text-muted-foreground">
            Exporte dados para análise offline e integração com ferramentas de BI
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {exportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card key={option.value} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{option.count}</Badge>
                </div>
                <CardTitle className="text-sm">{option.label}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Export Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Exportação</CardTitle>
          <CardDescription>
            Selecione o tipo de dados, período e formato para exportar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Export Type */}
            <div className="space-y-2">
              <Label>Tipo de Dados</Label>
              <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {exportOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="all">Todos os registros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      CSV (Excel/Google Sheets)
                    </div>
                  </SelectItem>
                  <SelectItem value="excel">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel (XLSX)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Export Button */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {exportType === 'agents' && `${stats?.agents || 0} agentes disponíveis`}
              {exportType === 'scans' && `${stats?.scans || 0} scans disponíveis`}
              {exportType === 'jobs' && `${stats?.jobs || 0} jobs disponíveis`}
              {exportType === 'quarantine' && `${stats?.quarantine || 0} arquivos em quarentena`}
              {exportType === 'audit_logs' && `${stats?.auditLogs || 0} logs de auditoria`}
            </div>
            <Button 
              onClick={exportData} 
              disabled={isExporting}
              size="lg"
              className="gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Exportar {exportFormat === 'csv' ? 'CSV' : 'Excel'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formato CSV</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Compatível com Excel, Google Sheets e outras ferramentas</p>
            <p>• Tamanho de arquivo menor</p>
            <p>• Ideal para importação em bancos de dados</p>
            <p>• Codificação UTF-8 com BOM para suporte completo de caracteres</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formato Excel (XLSX)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Formato nativo do Microsoft Excel</p>
            <p>• Colunas com largura automática</p>
            <p>• Preserva formatação e tipos de dados</p>
            <p>• Ideal para análise avançada e gráficos</p>
          </CardContent>
        </Card>
      </div>

      {/* Use Cases */}
      <Card>
        <CardHeader>
          <CardTitle>Casos de Uso</CardTitle>
          <CardDescription>Como utilizar os dados exportados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Análise Offline
              </h4>
              <p className="text-sm text-muted-foreground">
                Abra os dados no Excel ou Google Sheets para criar gráficos personalizados e relatórios
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Integração BI
              </h4>
              <p className="text-sm text-muted-foreground">
                Importe para Power BI, Tableau, Looker ou outras ferramentas de Business Intelligence
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Conformidade
              </h4>
              <p className="text-sm text-muted-foreground">
                Mantenha backups dos dados de auditoria para atender requisitos de compliance
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
